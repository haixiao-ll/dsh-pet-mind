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
  /** 同一应用的冷却（秒；优先级高于 cooldownMinutes；默认 30） */
  cooldownSec?: number;
  /** 同一应用的冷却（分钟，默认 30；没写 cooldownSec 时才用它） */
  cooldownMinutes?: number;
  /** 每天最多几条（默认 8） */
  dailyLimit?: number;
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
  private dwellKey = '';
  private dwellSince = 0;
  private readonly lastByApp = new Map<string, number>();
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
    if (Number.isFinite(Number(cfg.dwellSec))) return Math.max(5, Number(cfg.dwellSec)) * 1000;
    return Math.max(0.1, Number(cfg.dwellMinutes ?? 3)) * 60_000;
  }

  /** 冷却（ms）：cooldownSec 优先，其次 cooldownMinutes，默认 30 秒 */
  private cooldownMs(cfg: CoachConfig): number {
    if (Number.isFinite(Number(cfg.cooldownSec))) return Math.max(0, Number(cfg.cooldownSec)) * 1000;
    return Math.max(0, Number(cfg.cooldownMinutes ?? 30)) * 60_000;
  }

  /**
   * 现在"该不该打扰一次"：停留够久 + 不在免打扰 + 冷却过了 + 今天没超量。
   *
   * **调用即记账**（记冷却、加当日计数、重置停留起点）——所以本地文案模式与
   * 模型模式共用它，但一次采样只能走其中一条路，否则会重复计数。
   */
  due(sample: ActivitySample, canCapture: boolean, cfg: CoachConfig = {}): boolean {
    const now = this.now();
    const app = sample.app ?? '';
    const key = app || 'unknown';

    // 人不在 / 隐私被拦：清空停留计时。恢复采集后重新开始算
    if (!canCapture || this.isStandby(sample, cfg)) {
      this.dwellKey = '';
      this.dwellSince = 0;
      return false;
    }

    // 换应用 = 换一次"停留"，重新计时
    if (key !== this.dwellKey) {
      this.dwellKey = key;
      this.dwellSince = now;
      return false;
    }

    if (now - this.dwellSince < this.dwellMs(cfg)) return false;
    if (this.isQuietHour(now, cfg)) return false;

    const last = this.lastByApp.get(key) ?? 0;
    if (now - last < this.cooldownMs(cfg)) return false;

    const day = new Date(now).toDateString();
    if (day !== this.dayKey) {
      this.dayKey = day;
      this.dayCount = 0;
    }
    if (this.dayCount >= (cfg.dailyLimit ?? 8)) return false;

    this.lastByApp.set(key, now);
    this.dayCount += 1;
    this.dwellSince = now;
    return true;
  }

  /** 每 5 秒一条采样就调一次；返回建议（没有就 null）。本地文案模式走这里 */
  evaluate(sample: ActivitySample, canCapture: boolean, cfg: CoachConfig = {}): Suggestion | null {
    if (!this.due(sample, canCapture, cfg)) return null;
    const app = sample.app ?? '';
    const key = app || 'unknown';
    const texts = TEMPLATES[categoryOf(app)];
    const text = texts[Math.floor(this.random() * texts.length) % texts.length];
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
