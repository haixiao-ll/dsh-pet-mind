/**
 * Mind —— 宠物心智层的装配器（0.5 新增）。
 *
 * 把四个互相独立的部件拼在一起，并对外提供几个"宿主能直接调"的方法：
 *
 *   ┌─────────────┐   session/event    ┌──────────────┐
 *   │ DSH 宿主     │ ─────────────────▶ │ ContextMeter │──▶ 百分比 / 阈值提醒
 *   └─────────────┘                    └──────────────┘
 *   ┌─────────────┐   5s 一次           ┌──────────┐   ┌───────┐
 *   │ PowerShell  │ ─────────────────▶ │ Privacy  │──▶│ Coach │──▶ 建议气泡
 *   │ 采集器       │  空闲/前台应用      └──────────┘   └───────┘
 *   └─────────────┘
 *   ┌─────────────┐   会话消息缓冲       ┌──────────────┐
 *   │ 会话事件     │ ─────────────────▶ │ MemoryStore  │──▶ work/*.md + INDEX.md
 *   └─────────────┘                    └──────────────┘
 *
 * 设计原则：
 *   - 每个部件都是纯逻辑（可单测），本文件只做"接线 + 状态"；
 *   - 任何一个部件失败都不影响桌宠本体：sensor 起不来就只少一个功能；
 *   - **不写日志里的窗口标题**：标题只在隐私判定那一步用，绝不进日志/记忆。
 */

import { ContextMeter, ThresholdLatch, sessionIdOf, type SessionLike } from './context-meter';
import { Coach, contextWarningText, type CoachConfig } from './coach';
import { MemoryStore, summarizeLocally, type ChatLine, type WorkSummary } from './memory';
import { checkPrivacy, isSelfWindow, type PrivacyConfig } from './privacy';
import { startWindowsActivityWatcher, type ActivityWatcher } from './sensors/windows';
import type { ActivitySample, ContextSnapshot, Suggestion } from './types';

/** 用户可在 config.jsonc 的 `mind` 段里改的全部开关（全部有安全默认值） */
export interface MindConfig {
  /** 总开关：false = 整个心智层不启动（桌宠行为与旧版完全一致） */
  enabled?: boolean;
  context?: {
    /** 阈值（0–1，升序）：默认 [0.8, 0.95] */
    thresholds?: number[];
    /** 到阈值时让宠物开口提醒（默认 true） */
    notify?: boolean;
  };
  memory?: {
    /** 到阈值时自动落一份工作记忆（默认 true） */
    autoSummary?: boolean;
    /** 把「记忆卡片」注入 DSH 的系统提示词（默认 true，新会话/子支线因此能续上） */
    injectSystemPrompt?: boolean;
    /** 用模型润色本地摘要（默认 false：临近上限时调模型会再吃上下文，且失败要能退回本地） */
    polishWithModel?: boolean;
    /** 注入内容的最大字符数（默认 1600；过大反而吃掉上下文） */
    maxInjectChars?: number;
  };
  coach?: CoachConfig & { enabled?: boolean };
  privacy?: PrivacyConfig;
  sensor?: {
    /** 桌面活跃度采集（默认 true；只有 win32 有效） */
    enabled?: boolean;
    /** 采样间隔（ms，默认 5000） */
    intervalMs?: number;
  };
}

/** 宿主注入的依赖 */
export interface MindDeps {
  /** $DSH_HOME（记忆落在这里的 dsh-pet/memory/） */
  dshHome: string;
  /** 每次要用时现取配置（设置页保存后立即生效，不重启） */
  getConfig(): MindConfig;
  /** 让"当前桌宠"说一句（宿主负责选宠物、写 S） */
  say(text: string): void;
  /** 诊断日志（不带窗口标题） */
  log(message: string): void;
  /** 可选的模型润色：把本地抽取的摘要交给模型整理。
   *  约定：失败/不可用返回 null（调用方退回本地摘要），绝不抛错影响写盘。 */
  polish?(input: { lines: readonly ChatLine[]; draft: WorkSummary }): Promise<Partial<WorkSummary> | null>;
  /** 把展示用的心智状态单向广播给渲染端（宿主写 S 的 sections.mind）。
   *  浏览器用它画进度环、桌面 Helper 用它切待机；失败不影响任何逻辑。 */
  publish?(view: { enabled: boolean; standby: boolean; context: ContextSnapshot | null }): void;
}

/** 给 HTTP /mind/state 的响应（客户端轮询用；**不含窗口标题**） */
export interface MindStateView {
  enabled: boolean;
  context: ContextSnapshot | null;
  activity: {
    at: number;
    idleMs: number;
    standby: boolean;
    app: string;
    /** 是否允许采集（隐私闸门结果） */
    capture: boolean;
    reason: string;
  } | null;
  memory: { docs: number; indexChars: number };
  suggestion: { text: string; at: number } | null;
}

/** 每个会话保留的对话行数上限（摘要只用最近这些） */
const TRANSCRIPT_LIMIT = 160;

export class Mind {
  private readonly meter = new ContextMeter();
  private readonly latch = new ThresholdLatch();
  private readonly coach = new Coach();
  private readonly store: MemoryStore;
  private readonly transcripts = new Map<string, ChatLine[]>();
  private watcher?: ActivityWatcher;
  private lastSample?: ActivitySample;
  private lastPrivacy: { capture: boolean; reason: string } = { capture: false, reason: 'unknown-app' };
  private lastSuggestion: Suggestion | null = null;
  private standby = false;
  /** 上次广播出去的心智状态签名（去重：内容没变就不写 S，免得每 5 秒唤醒所有窗口） */
  private lastPublished = '';
  /** 上次的前台窗口标识与"它第一次出现的时间"：前台一变就当作人在动（见 onSample 的兜底） */
  private lastForegroundKey = '';
  private foregroundSince = 0;
  private framePaused = false;
  private started = false;

  /** 宿主注入的依赖（显式字段而非构造函数参数属性：Node 的 strip-only 类型擦除不支持参数属性） */
  private readonly deps: MindDeps;

  constructor(deps: MindDeps) {
    this.deps = deps;
    this.store = new MemoryStore(deps.dshHome);
  }

  /** 启动采集器（幂等；配置 enabled=false 时什么都不做） */
  start(): void {
    if (this.started) return;
    const cfg = this.deps.getConfig();
    if (cfg.enabled === false) return;
    this.started = true;
    const sensor = cfg.sensor ?? {};
    if (sensor.enabled === false) {
      this.deps.log('桌面感知：配置关闭');
      return;
    }
    this.watcher = startWindowsActivityWatcher({
      intervalMs: sensor.intervalMs ?? 5000,
      onSample: (sample) => this.onSample(sample),
      log: (m) => this.deps.log(m),
    });
    if (!this.watcher.running) this.deps.log('桌面感知：当前环境不可用（仅 Windows 支持）');
  }

  /** 进程退出/插件卸载时调用 */
  stop(): void {
    this.watcher?.stop();
    this.watcher = undefined;
    this.started = false;
  }

  /** 手动暂停采集（设置页的「隐私暂停」按钮 / 快捷键）；暂停期间不清空停留计时以外的东西 */
  pause(paused: boolean): void {
    this.framePaused = paused;
    if (paused) this.lastPrivacy = { capture: false, reason: 'paused' };
    this.publishNow();
  }

  paused(): boolean {
    return this.framePaused;
  }

  /**
   * 吃一条 DSH 会话事件：
   *   1. 计量上下文；到阈值 → 提醒 + 自动落一份工作记忆；
   *   2. 缓冲对话文本，供摘要使用（子代理会话不记，避免把子任务写进主记忆）。
   */
  onSessionEvent(session: SessionLike | null | undefined, event: unknown): void {
    const cfg = this.deps.getConfig();
    if (cfg.enabled === false) return;
    const ev = event as { type?: unknown } | null;
    const type = typeof ev?.type === 'string' ? ev.type : '';
    if (!type) return;

    // 1) 计量（ContextMeter 自己会过滤子代理会话）
    this.meter.observe(session, event);
    // 计量变了就广播一次（去重在里面：request/context 与 usage 各来一条也不会写两次）
    this.publishNow();

    // 2) 文本缓冲（排除子代理：它们的对话属于子任务，写进"我们的记忆"会污染）
    if (type === 'user/message' || type === 'assistant/message') {
      const id = sessionIdOf(session);
      const isSubagent = (session as { header?: { origin?: unknown; delegationDepth?: unknown } } | null)?.header;
      if (isSubagent?.origin === 'subagent' || (typeof isSubagent?.delegationDepth === 'number' && isSubagent.delegationDepth > 0)) {
        return;
      }
      const text = textOf(ev as Record<string, unknown>);
      if (!text) return;
      const list = this.transcripts.get(id) ?? [];
      list.push({ role: type === 'user/message' ? 'user' : 'assistant', text, at: Date.now() });
      if (list.length > TRANSCRIPT_LIMIT) list.splice(0, list.length - TRANSCRIPT_LIMIT);
      this.transcripts.set(id, list);
    }

    // 3) 阈值：只在 assistant/message（拿到真实 usage）之后判定
    if (type !== 'assistant/message') return;
    const snap = this.meter.snapshot(sessionIdOf(session));
    if (!snap || snap.percent === undefined) return;
    const contextCfg = cfg.context ?? {};
    const thresholds = (contextCfg.thresholds ?? [0.8, 0.95]).filter((n) => n > 0 && n <= 1).sort((a, b) => a - b);
    const hit = this.latch.check(snap.sessionId, snap.percent, thresholds);
    if (hit === undefined) return;

    if (contextCfg.notify !== false) this.deps.say(contextWarningText(hit, snap.percent));
    if ((cfg.memory ?? {}).autoSummary !== false) {
      void this.summarize(snap.sessionId).catch((error: unknown) => {
        this.deps.log(`自动记忆失败：${(error as Error).message}`);
      });
    }
  }

  /** 一条桌面活跃度采样：隐私闸门 → Coach → 建议 */
  onSample(sample: ActivitySample): void {
    const cfg = this.deps.getConfig();
    if (cfg.enabled === false) return;
    this.lastSample = sample;

    // 待机只取决于 system idle，与"哪个窗口在前台"无关——所以先算它，
    // 否则桌宠自己被点成前台窗口时，人离开了也永远不会进入待机。
    const coachCfg = { ...(cfg.coach ?? {}) };
    // 兜底：前台窗口**变了**说明人刚动过。某些环境（远程桌面/虚拟输入）GetLastInputInfo
    // 不会随输入重置，只靠 idleMs 会永远待机；窗口切换是更硬的"人在"证据。
    const key = (sample.app ?? '') + '|' + (sample.title ?? '');
    if (key !== this.lastForegroundKey) {
      this.lastForegroundKey = key;
      this.foregroundSince = sample.at;
    }
    const justSwitched = sample.at - this.foregroundSince < 10_000;
    const wasStandby = this.standby;
    this.standby = this.coach.isStandby(sample, coachCfg) && !justSwitched;
    if (this.standby !== wasStandby) {
      // 人不在：不发消息（用户明确要求"不做任何操作"），只停止建议；回来后也不打扰
      this.deps.log(this.standby ? '桌面感知：用户离开，转入待机' : '桌面感知：用户回来，恢复建议');
    }

    // 桌宠自己的窗口不算"用户停留的应用"：不然点一下宠物就会触发"你在这个窗口停了好久"
    if (isSelfWindow(sample.app, sample.title)) {
      this.lastPrivacy = { capture: false, reason: 'ok' };
      this.coach.evaluate(sample, false, coachCfg);
      // 待机/回来要立刻让渲染端知道（1s 轮询会顺带读到，但这里主动写一次，切歌更跟手）
      this.publishNow();
      return;
    }
    const privacyCfg: PrivacyConfig = { ...(cfg.privacy ?? {}), paused: this.framePaused || cfg.privacy?.paused === true };
    const decision = checkPrivacy({ app: sample.app, title: sample.title }, privacyCfg);
    this.lastPrivacy = { capture: decision.capture, reason: decision.reason };

    this.publishNow();
    if (this.standby) return;
    if (coachCfg.enabled === false) return;

    const suggestion = this.coach.evaluate(sample, decision.capture, coachCfg);
    if (!suggestion) return;
    this.lastSuggestion = suggestion;
    this.deps.say(suggestion.text);
    this.deps.log(`建议已发送：${suggestion.reason}`);
  }

  /** 是否处于「人不在」的待机态（宿主用它静音碎碎念、客户端用它只播 idle） */
  isStandby(): boolean {
    return this.standby;
  }

  /**
   * 把当前心智状态写进 S（`sections.mind`）：浏览器画进度环、桌面 Helper 切待机，
   * 都靠这一份。**去重**：内容没变就不写——否则每 5 秒一条采样都会唤醒所有长轮询窗口。
   */
  publishNow(): void {
    if (typeof this.deps.publish !== 'function') return;
    try {
      const view = {
        enabled: this.deps.getConfig().enabled !== false,
        standby: this.standby,
        context: this.meter.latest() ?? null,
      };
      const sig = JSON.stringify(view);
      if (sig === this.lastPublished) return;
      this.lastPublished = sig;
      this.deps.publish(view);
    } catch {
      /* 展示层失败不影响心智层 */
    }
  }

  /** 视觉传感器是否可用（当前版本返回 false：截帧管线尚未接线，见 docs/MIND.md） */
  canSee(): boolean {
    return false;
  }

  /**
   * 落一份工作记忆。
   * @param sessionId 指定会话；缺省取最近有对话的那条
   * @returns 文件名，或失败原因
   */
  async summarize(sessionId?: string): Promise<{ ok: true; file: string } | { ok: false; reason: string }> {
    const id = sessionId ?? [...this.transcripts.keys()].pop();
    if (!id) return { ok: false, reason: 'no-session' };
    const lines = this.transcripts.get(id) ?? [];
    if (lines.length === 0) return { ok: false, reason: 'no-transcript' };
    let summary = summarizeLocally(lines);
    // 可选：模型润色（默认关闭）。**失败就退回本地摘要**——记忆宁可朴素，不能丢。
    const cfg = this.deps.getConfig();
    if (cfg.memory?.polishWithModel === true && typeof this.deps.polish === 'function') {
      try {
        const polished = await this.deps.polish({ lines, draft: summary });
        if (polished) summary = { ...summary, ...polished };
      } catch (error) {
        this.deps.log(`模型润色失败，退回本地摘要：${(error as Error).message}`);
      }
    }
    const file = this.store.writeWork(summary, { sessionId: id });
    // 摘要落盘后清空缓冲，避免同一段对话被重复记（下次从"新的对话"开始）
    this.transcripts.set(id, []);
    return { ok: true, file };
  }

  /** 陪伴记忆：一句话值不值得记（由 chat 路径调用） */
  rememberCompanion(text: string): void {
    if (this.deps.getConfig().enabled === false) return;
    if (!MemoryStore.worthRemembering(text)) return;
    try {
      this.store.appendCompanion(text);
    } catch (error) {
      this.deps.log(`陪伴记忆写入失败：${(error as Error).message}`);
    }
  }

  /** 注入系统提示词的内容（没有记忆时返回空串，DSH 会把空 section 当无内容） */
  injection(): string {
    const cfg = this.deps.getConfig();
    if (cfg.enabled === false) return '';
    const memoryCfg = cfg.memory ?? {};
    if (memoryCfg.injectSystemPrompt === false) return '';
    try {
      return this.store.injectionText(memoryCfg.maxInjectChars ?? 1600);
    } catch {
      return '';
    }
  }

  /** 客户端轮询用的聚合视图（脱敏：不含窗口标题、不含记忆正文） */
  view(): MindStateView {
    const cfg = this.deps.getConfig();
    const snap = this.meter.latest() ?? null;
    const sample = this.lastSample;
    const docs = this.store.readIndex().split('\n').filter((l) => l.startsWith('- [')).length;
    return {
      enabled: cfg.enabled !== false,
      context: snap,
      activity: sample
        ? {
            at: sample.at,
            idleMs: sample.idleMs,
            standby: this.standby,
            app: sample.app ?? '',
            capture: this.lastPrivacy.capture,
            reason: this.lastPrivacy.reason,
          }
        : null,
      memory: { docs, indexChars: this.store.readIndex().length },
      suggestion: this.lastSuggestion ? { text: this.lastSuggestion.text, at: this.lastSuggestion.at } : null,
    };
  }

  /** 记忆索引（给设置页「记忆」卡片） */
  memoryIndex(): string {
    return this.store.readIndex();
  }

  /** 手动触发一次摘要（POST /mind/summarize） */
  async summarizeNow(sessionId?: string): Promise<{ ok: boolean; file?: string; reason?: string }> {
    try {
      const r = await this.summarize(sessionId);
      return r.ok ? { ok: true, file: r.file } : { ok: false, reason: r.reason };
    } catch (error) {
      return { ok: false, reason: (error as Error).message };
    }
  }

  /** 测试/诊断：当前跟踪的会话数 */
  sessionCount(): number {
    return this.transcripts.size;
  }
}

/**
 * 从 DSH 消息事件里抽纯文本：`message.content` 是 ContentBlock[]，
 * 只取 type==='text' 的块；其它（图片/工具调用/推理）一律跳过——
 * 记忆里只该有"人说的话"和"宠物说的话"。
 */
export function textOf(event: Record<string, unknown>): string {
  const message = event.message as { content?: unknown } | undefined;
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const parts: string[] = [];
  for (const block of blocks) {
    const b = block as { type?: unknown; text?: unknown };
    if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text);
  }
  return parts.join('\n').trim();
}
