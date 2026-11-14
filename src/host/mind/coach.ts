/**
 * Coach —— 什么时候该说话、说什么、说几次。
 *
 * 规则（全部可配，默认值就按用户要的来）：
 *   - 在同一个应用/窗口停留 ≥ dwellMinutes（默认 3 分钟）→ 可以建议一次；
 *   - **同一次停留只建议一次**：应用不变就一直是"同一次"，换了应用才重新计时；
 *   - 冷却：同一应用在 cooldownMinutes（默认 30 分钟）内不再建议；
 *   - 每日上限：默认 8 条，防止变成骚扰；
 *   - 人不在（空闲 ≥ idleMinutes）：一条都不发，由宿主切"待机"动作；
 *   - 隐私闸门拦下的应用：等同"不在"——不计时、不建议、不采集。
 *
 * 本模块是纯状态机（注入 now / 随机），不碰 DOM、不碰网络，便于单测。
 */

import type { ActivitySample, Suggestion } from './types';

/** 建议策略配置 */
export interface CoachConfig {
  /** 在同一界面停留多少秒才建议（优先级高于 dwellMinutes；默认 30） */
  dwellSec?: number;
  /** 停留多少分钟才建议（旧字段；没写 dwellSec 时才用它，默认 3） */
  dwellMinutes?: number;
  /** 空闲多少分钟算"人不在"（默认 5） */
  idleMinutes?: number;
  /** @deprecated 不再参与判定：现在是"一次停留只建议一次"。仅保留字段避免旧配置报错 */
  cooldownSec?: number;
  /** @deprecated 同上 */
  cooldownMinutes?: number;
  /** 每天最多几条（默认 6） */
  dailyLimit?: number;
  /** 同一次停留最多尝试几次（默认 2 = 首次 + 失败重试 1 次） */
  maxAttemptsPerStay?: number;
  /** 夜间免打扰时段 [开始小时, 结束小时)（默认 [23, 8)；跨越午夜） */
  quietHours?: readonly [number, number];
}

export interface CoachOptions {
  /** 注入时钟（测试用） */
  now?: () => number;
  /** 注入随机（选文案用） */
  random?: () => number;
}

/** 按应用类型粗略分类，决定建议的语气/内容（识别不出就通用） */
function categoryOf(app: string | undefined): 'editor' | 'browser' | 'chat' | 'generic' {
  const a = (app ?? '').toLowerCase();
  if (/(code|idea|webstorm|pycharm|clion|goland|rider|studio|vim|emacs|sublime|notepad)/.test(a)) return 'editor';
  if (/(chrome|edge|firefox|safari|brave|opera|browser)/.test(a)) return 'browser';
  if (/(wechat|qq|dingtalk|feishu|lark|slack|discord|telegram)/.test(a)) return 'chat';
  return 'generic';
}

const TEMPLATES: Record<'editor' | 'browser' | 'chat' | 'generic', readonly string[]> = {
  editor: [
    '这段写了好一会儿啦，要不要先跑一下测试？',
    '坐了三分钟没动，肩膀放松一下。',
    '要不要把刚才的思路留一句在注释里？',
  ],
  browser: [
    '看了好一会儿了，要不要把看到的结论记一句？',
    '眼睛该休息十秒了，看看远处。',
    '要不要把有用的链接先存下来？',
  ],
  chat: [
    '聊了好一会儿了，记得喝口水。',
    '要不要先回完手上的事，再看消息？',
    '顺手把待办记一下吧。',
  ],
  generic: [
    '在这个窗口停了一会儿了，要不要换个姿势？',
    '提醒一下：喝口水，看看远处。',
    '需要我把刚才的事记成一条备忘吗？',
  ],
};

type Send = { key: string; text: string; at: number };

/**
 * 建议状态机。
 *
 * 用法：每次采样调 `evaluate(sample, canCapture)`，
 * 返回非 null 就把它交给宿主（写气泡 + 播动作），同时它会自己记冷却。
 */
export class Coach {
  /** 本次"停留"的键：应用 + 窗口标题（标题变化 = 新页面）。 */
  private stayKey = '';
  private staySince = 0;
  /** 这次停留是否已经成功建议过（成功即封口） */
  private stayDone = false;
  /** 这次停留已经尝试了几次（OCR/模型失败可以再来一次，但不超过 maxAttemptsPerStay） */
  private stayAttempts = 0;
  /** 有一次建议正在生成（防止并发/重复触发） */
  private inFlight = false;
  private dayKey = '';
  private dayCount = 0;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(opts: CoachOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
  }

  /** 是否处于"人不在"（空闲超阈值）状态——宿主据此切待机动作 */
  isStandby(sample: ActivitySample, cfg: CoachConfig = {}): boolean {
    const idleMinutes = cfg.idleMinutes ?? 5;
    return sample.idleMs >= Math.max(1, idleMinutes) * 60_000;
  }

  /** 夜间免打扰（[23,8) 这类跨午夜区间） */
  isQuietHour(now: number, cfg: CoachConfig = {}): boolean {
    const [start, end] = cfg.quietHours ?? [23, 8];
    const h = new Date(now).getHours();
    if (start === end) return false;
    return start > end ? h >= start || h < end : h >= start && h < end;
  }

  /** 停留阈值（ms）：dwellSec 优先，其次 dwellMinutes，默认 30 秒 */
  private dwellMs(cfg: CoachConfig): number {
    if (typeof cfg.dwellSec === 'number' && Number.isFinite(cfg.dwellSec)) {
      return Math.max(5, cfg.dwellSec) * 1000;
    }
    return Math.max(0.1, Number(cfg.dwellMinutes ?? 3)) * 60_000;
  }

  /**
   * 现在"该不该打扰一次"：停留够久 + 不在免打扰 + 冷却过了 + 今天没超量。
   *
   * **调用即记账**（记冷却、加当日计数、重置停留起点）——所以本地文案模式与
   * 模型模式共用它，但一次采样只能走其中一条路，否则会重复计数。
   */
  due(sample: ActivitySample, canCapture: boolean, cfg: CoachConfig = {}): boolean {
    const now = this.now();
    // 一次"停留" = 一个应用的一个页面（窗口标题变化算新页面：浏览器切标签、IDE 切文件）。
    const key = (sample.app ?? '') + String.fromCharCode(0) + (sample.title ?? '');

    if (key !== this.stayKey) {
      // 新页面：重新计时、重新给一次机会
      this.stayKey = key;
      this.staySince = now;
      this.stayDone = false;
      this.stayAttempts = 0;
      this.inFlight = false;
      return false;
    }

    // 人不在 / 隐私被拦：暂停计时（回来重新数 30 秒），但**不清"已建议"**——
    // 同一个页面离开再回来不算新页面，不该再打扰一次。
    if (!canCapture || this.isStandby(sample, cfg)) {
      this.staySince = now;
      return false;
    }

    if (this.stayDone || this.inFlight) return false;
    if (now - this.staySince < this.dwellMs(cfg)) return false;
    if (this.isQuietHour(now, cfg)) return false;

    // 每日上限（本地日期切换时清零）
    const day = new Date(now).toDateString();
    if (day !== this.dayKey) {
      this.dayKey = day;
      this.dayCount = 0;
    }
    if (this.dayCount >= (cfg.dailyLimit ?? 6)) return false;

    const maxAttempts = Math.max(1, Number(cfg.maxAttemptsPerStay) || 2);
    if (this.stayAttempts >= maxAttempts) return false;

    this.stayAttempts += 1;
    this.inFlight = true;
    this.staySince = now; // 下一次尝试（如果失败）从这一刻起再数 30 秒
    // 注意：这里**不**给 dayCount 加一。OCR 读不出字 / 模型失败时不该白占当天额度，
    // 由调用方在气泡真的发出去之后调 commitSuggestion()。
    return true;
  }

  /** 建议真的弹出：封口 + 计入当日额度（失败不占额度） */
  commitSuggestion(): void {
    this.inFlight = false;
    this.stayDone = true;
    const day = new Date(this.now()).toDateString();
    if (day !== this.dayKey) {
      this.dayKey = day;
      this.dayCount = 0;
    }
    this.dayCount += 1;
  }

  /** 这次尝试失败（OCR 无字 / 模型报错 / SKIP）：允许到点后再试一次 */
  failSuggestion(): void {
    this.inFlight = false;
  }

  /** 卡住兜底：生成请求一直没回（Helper 挂了等），超过 staleMs 视为失败，别把这一页永久封死 */
  expireInFlight(now = this.now(), staleMs = 20_000): void {
    if (this.inFlight && now - this.staySince > staleMs) this.inFlight = false;
  }


  /** 每 5 秒一条采样就调一次；返回建议（没有就 null）。本地文案模式走这里 */
  evaluate(sample: ActivitySample, canCapture: boolean, cfg: CoachConfig = {}): Suggestion | null {
    if (!this.due(sample, canCapture, cfg)) return null;
    const app = sample.app ?? '';
    const key = app || 'unknown';
    const texts = TEMPLATES[categoryOf(app)];
    const text = texts[Math.floor(this.random() * texts.length) % texts.length];
    this.commitSuggestion();
    return { key, text, reason: 'dwell', at: this.now() };
  }

  /** 测试/诊断：今天已经说了几条 */
  countToday(): number {
    return this.dayCount;
  }
}

/**
 * 上下文阈值提醒的文案（与 Coach 分开：一个是"停留"，一个是"快满了"）。
 * 这里只负责措辞，是否触发由 ThresholdLatch 决定。
 */
export function contextWarningText(level: number, percent: number): string {
  const p = Math.round(percent * 100);
  if (level >= 0.95) return `上下文只剩不到 5% 了（${p}%），要不要我先记一份笔记再继续？`;
  return `上下文已经用了 ${p}% 啦，要不要我帮你把这段记成笔记？`;
}

/** 给 host 用的辅助：把 Suggest 转成"可发送"的形状（保持纯函数，便于日志脱敏） */
export function toSend(suggestion: Suggestion): Send {
  return { key: suggestion.key, text: suggestion.text, at: suggestion.at };
}
