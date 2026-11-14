// 心智层的展示用纯逻辑（浏览器半侧用；不依赖 React/DOM，便于单测）。
//
// 数据来自 host 的 GET /dsh-pet-7340/mind/state（聚合视图，已脱敏：不含窗口标题）。
// 这个文件只做两件事：**容错解析**与**进度环的颜色/文案**——两者都容易写错，所以单独放。

/** 上下文快照（与 host 的 ContextSnapshot 同形；只取展示需要的字段） */
export interface MindContextView {
  usedTokens: number;
  contextWindow?: number;
  percent?: number;
  provider?: string;
  model?: string;
  at?: number;
  /** true = 启动时恢复的上一轮快照（等本轮数据到了会替换） */
  stale?: boolean;
}

/** /mind/state 的展示视图（宽松：宿主版本不同也尽量读出能读的） */
export interface MindStateView {
  enabled: boolean;
  context: MindContextView | null;
  standby: boolean;
  /** 是否允许采集（隐私闸门结果；仅诊断用） */
  capture: boolean;
  /** 最近一次隐私判定的原因（'ok' / 'paused' / 'sensitive-app' / 'unknown-app' …） */
  reason: string;
  /** 记忆索引里的文档条数 */
  memoryDocs: number;
}

/** 从任意 JSON 里安全读出展示视图：字段缺失/类型不对一律降级，绝不抛 */
export function readMindState(raw: unknown): MindStateView {
  const empty: MindStateView = { enabled: false, context: null, standby: false, capture: false, reason: '', memoryDocs: 0 };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;
  if (obj.ok === false) return empty;

  let context: MindContextView | null = null;
  const c = obj.context as Record<string, unknown> | null | undefined;
  if (c && typeof c === 'object') {
    const used = Number(c.usedTokens);
    const win = Number(c.contextWindow);
    const pct = Number(c.percent);
    if (Number.isFinite(used) && used >= 0) {
      context = {
        usedTokens: used,
        contextWindow: Number.isFinite(win) && win > 0 ? win : undefined,
        percent: Number.isFinite(pct) && pct >= 0 ? Math.min(1, pct) : undefined,
        provider: typeof c.provider === 'string' ? c.provider : undefined,
        model: typeof c.model === 'string' ? c.model : undefined,
        at: Number.isFinite(Number(c.at)) ? Number(c.at) : undefined,
        stale: c.stale === true,
      };
    }
  }

  const activity = (obj.activity ?? null) as Record<string, unknown> | null;
  const memory = (obj.memory ?? null) as Record<string, unknown> | null;
  return {
    enabled: obj.enabled === true,
    context,
    standby: activity?.standby === true,
    capture: activity?.capture === true,
    reason: typeof activity?.reason === 'string' ? activity.reason : '',
    memoryDocs: Number(memory?.docs) > 0 ? Number(memory?.docs) : 0,
  };
}

/** 进度环颜色：绿（宽裕）→ 琥珀（该留意）→ 红（快满了）。阈值与 host 的提醒档位对齐 */
export function ringColor(percent: number): string {
  if (percent >= 0.95) return '#f87171'; // red-400
  if (percent >= 0.8) return '#fbbf24'; // amber-400
  return '#4ade80'; // green-400
}

/** token 数的紧凑写法：79_321 → "79k"，1_200_000 → "1.2M" */
export function formatTokens(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '0';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1000) return Math.round(v / 1000) + 'k';
  return String(Math.round(v));
}

/** 进度环的无障碍文案 / 悬停提示 */
export function ringTitle(context: MindContextView | null): string | undefined {
  if (!context || typeof context.percent !== 'number') return undefined;
  const pct = Math.round(context.percent * 100);
  const win = context.contextWindow;
  const detail = win ? `（${formatTokens(context.usedTokens)} / ${formatTokens(win)} tokens）` : '';
  const note = context.stale ? '（上次记录，等待本轮数据）' : '';
  return `上下文已用 ${pct}%${detail}${note}`;
}
