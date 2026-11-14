/**
 * ContextMeter —— 上下文用量计量（纯逻辑，可单测）。
 *
 * 数据从哪来（DSH 宿主事件，全部在内存里算，不读磁盘、不发请求）：
 *   - `session/event` 的 `assistant/message`：带 `usage`（TokenUsage），
 *     是**那一步真实上报的 token 账**；
 *   - `session/event` 的 `request/context`：带 `contextWindow`（模型窗口）与 provider/model。
 *
 * 为什么不用 `totalTokens` 直接当"上下文占用"：它的语义是"这一次调用的总量"
 * （prompt + completion），与我们关心的"下一轮还能塞多少"不是一回事；更要紧的是
 * **它可能缺省**。所以统一按分量相加，缺分量就少算，最后用 `totalTokens` 兜底。
 *
 * 口径（与厂商计费口径一致）：
 *   已用 ≈ inputTokens（未命中缓存的输入）+ cacheReadTokens + cacheWriteTokens + outputTokens
 * 厂商把缓存命中折进 prompt_tokens 的（如 DeepSeek），适配器已在上游减掉，这里不再处理。
 */

import type { ContextSnapshot } from './types';

/** DSH 的 TokenUsage（这里只声明用得到的字段，避免 import 宿主类型） */
export interface TokenUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

/** 把 DSH 的 TokenUsage 折算成"上下文已占用 token"；缺字段按 0，全缺返回 undefined */
export function usedTokensOf(usage: TokenUsageLike | undefined): number | undefined {
  if (!usage) return undefined;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const input = num(usage.inputTokens) + num(usage.cacheReadTokens) + num(usage.cacheWriteTokens);
  const output = num(usage.outputTokens);
  const sum = input + output;
  if (sum > 0) return sum;
  // 全部缺失时不冒充 0：0 会被百分比算成"完全空闲"，比"未知"更误导
  return num(usage.totalTokens) > 0 ? num(usage.totalTokens) : undefined;
}

/** 百分比：窗口未知/非法时返回 undefined（**不返回 0**，0 与"未知"语义不同） */
export function percentOf(usedTokens: number, contextWindow: number | undefined): number | undefined {
  if (!Number.isFinite(contextWindow) || !contextWindow || contextWindow <= 0) return undefined;
  return Math.max(0, Math.min(1, usedTokens / contextWindow));
}

/** 会话形状（只声明用到的字段；DSH 的 Session 结构比这大得多） */
export interface SessionLike {
  id?: unknown;
  header?: { id?: unknown; origin?: unknown; delegationDepth?: unknown } | null;
}

/** 取会话 id（与 notify-events 的 sessionIdOf 同一口径） */
export function sessionIdOf(session: SessionLike | null | undefined): string {
  return String(session?.header?.id ?? session?.id ?? 'unknown');
}

/**
 * 这条会话要不要计入"当前上下文"：
 * 子代理 / 委派会话（origin=subagent、delegationDepth>0）不算——它们各自有独立的窗口，
 * 把它们加进来会让"上下文用量"在并行子任务时虚高，用户看到的是主对话的进度才对。
 */
export function isMeteredSession(session: SessionLike | null | undefined): boolean {
  const header = session?.header;
  if (!header || typeof header !== 'object') return true;
  if (header.origin === 'subagent') return false;
  const depth = header.delegationDepth;
  return !(typeof depth === 'number' && Number.isFinite(depth) && depth > 0);
}

/**
 * 有状态的计量器：按会话保存最近一份快照。
 *
 * 只保留"最近一次事件"的结果：上下文占用是**当前位置**，不是累计账单——
 * 把每次 turn 的 token 加起来会把整条会话的历史算成"已满"，那是账单不是水位。
 */
export class ContextMeter {
  private readonly bySession = new Map<string, ContextSnapshot>();

  /** 吃一条宿主事件；不认识的形状一律忽略（宿主换字段时不至于抛错） */
  observe(session: SessionLike | null | undefined, event: unknown): void {
    if (!isMeteredSession(session)) return;
    const ev = event as {
      type?: unknown;
      /** DSH 的事件载荷（session.v4）：usage / contextWindow 都在 data 里 */
      data?: { usage?: TokenUsageLike; contextWindow?: unknown; provider?: unknown; model?: unknown; context?: unknown };
      usage?: TokenUsageLike;
      contextWindow?: unknown;
      provider?: unknown;
      model?: unknown;
      context?: unknown;
    } | null;
    if (!ev || typeof ev !== 'object') return;
    // 线上事件形状是 { type, seq, time, data }；兼容早期/扁平形状（顶层直接放字段）
    const payload = (ev.data && typeof ev.data === 'object' ? ev.data : ev) as {
      usage?: TokenUsageLike;
      contextWindow?: unknown;
      provider?: unknown;
      model?: unknown;
      context?: unknown;
    };
    const id = sessionIdOf(session);

    if (ev.type === 'assistant/message') {
      const used = usedTokensOf(payload.usage);
      if (used === undefined) return;
      const prev = this.bySession.get(id);
      this.bySession.set(id, {
        sessionId: id,
        usedTokens: used,
        contextWindow: prev?.contextWindow,
        percent: percentOf(used, prev?.contextWindow),
        provider: prev?.provider,
        model: prev?.model,
        at: Date.now(),
      });
      return;
    }

    if (ev.type === 'request/context') {
      // 形状：{ provider, model, contextWindow? }（也可能被包在 ev.context 里）
      const raw = (payload.context ?? payload) as { provider?: unknown; model?: unknown; contextWindow?: unknown };
      const window = Number(raw.contextWindow);
      const prev = this.bySession.get(id) ?? { sessionId: id, usedTokens: 0, at: Date.now() };
      this.bySession.set(id, {
        ...prev,
        contextWindow: Number.isFinite(window) && window > 0 ? window : prev.contextWindow,
        provider: typeof raw.provider === 'string' ? raw.provider : prev.provider,
        model: typeof raw.model === 'string' ? raw.model : prev.model,
        percent: percentOf(prev.usedTokens, Number.isFinite(window) && window > 0 ? window : prev.contextWindow),
        at: Date.now(),
      });
    }
  }

  /** 取某会话快照；没有则 undefined（调用方决定怎么展示"还没有数据"） */
  snapshot(sessionId: string): ContextSnapshot | undefined {
    return this.bySession.get(sessionId);
  }

  /** 当前"最活跃"的那条（最近更新时间最晚的），用于设置页/气泡的默认展示 */
  latest(): ContextSnapshot | undefined {
    let best: ContextSnapshot | undefined;
    for (const snap of this.bySession.values()) {
      if (!best || snap.at >= best.at) best = snap;
    }
    return best;
  }

  /** 清掉一条会话（会话被删/被归档时调用；内存不回收会随会话数增长） */
  forget(sessionId: string): void {
    this.bySession.delete(sessionId);
  }

  /** 只给测试/诊断用：当前跟踪的会话数 */
  size(): number {
    return this.bySession.size;
  }
}

/** 阈值判定：返回本次应该提醒的档位（已经提醒过的档位不重复返回） */
export class ThresholdLatch {
  private readonly fired = new Map<string, Set<number>>();

  /**
   * @param sessionId 会话
   * @param percent 0–1（未知时不提醒）
   * @param thresholds 升序阈值列表，如 [0.8, 0.95]
   * @returns 命中的最高档位；已经报过的档位不会重复返回
   */
  check(sessionId: string, percent: number | undefined, thresholds: readonly number[]): number | undefined {
    if (percent === undefined || !Number.isFinite(percent)) return undefined;
    let hit: number | undefined;
    for (const t of thresholds) {
      if (percent >= t) hit = t;
    }
    if (hit === undefined) return undefined;
    let fired = this.fired.get(sessionId);
    if (!fired) {
      fired = new Set();
      this.fired.set(sessionId, fired);
    }
    // 只报"比已经报过的更高"的档位：80% 报过之后，85% 不再骚扰，95% 才再提醒
    let highest = -1;
    for (const t of fired) highest = Math.max(highest, t);
    if (hit <= highest) return undefined;
    fired.add(hit);
    return hit;
  }

  forget(sessionId: string): void {
    this.fired.delete(sessionId);
  }
}
