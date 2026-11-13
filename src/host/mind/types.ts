/**
 * dsh-pet / mind —— 宠物"心智层"的公共类型。
 *
 * 这一层是 0.5 新增的：宠物不再只做动画，它开始关心三件事——
 *   1. 你这条会话的上下文还剩多少（ContextMeter）；
 *   2. 你们一起做过什么、说过什么（Memory，双轨：工作记忆 / 陪伴记忆）；
 *   3. 你此刻在不在、在忙什么、该不该打扰（Sensors + Coach）。
 *
 * 类型放这里而不是各自模块里，是为了让 host / client / 测试共用同一份"契约"，
 * 加字段时一处生效。所有字段都按"宿主可能给不全"设计（可选 + 消费端兜底）。
 */

/** 一次上下文用量的快照（GET /mind/context 的响应体，也是阈值提醒的判据） */
export interface ContextSnapshot {
  /** 会话 id；没有可用会话时为 'unknown' */
  sessionId: string;
  /** 已占用 token（输入 + 缓存读 + 缓存写 + 输出；口径见 context-meter.ts） */
  usedTokens: number;
  /** 模型窗口（token）；宿主没上报时缺省 */
  contextWindow?: number;
  /** usedTokens / contextWindow，0–1；窗口未知时缺省（**不要**拿 0 冒充"用完了"） */
  percent?: number;
  /** 当前请求路由（服务商/模型），供设置页展示 */
  provider?: string;
  model?: string;
  /** 采样时间（ms） */
  at: number;
}

/** 桌面活跃度采样（由 Windows 侧采集器产出；隐私相关字段见 privacy.ts） */
export interface ActivitySample {
  /** 采样时间（ms） */
  at: number;
  /** 系统空闲时长（ms，键盘+鼠标最近一次输入至今） */
  idleMs: number;
  /** 前台进程名（小写、去扩展名，如 'wechat'）；采集不到时缺省 */
  app?: string;
  /** 前台窗口标题（**可能含隐私**：只在内存里用，绝不落盘、绝不发网络） */
  title?: string;
}

/** 隐私闸门的判定结果 */
export interface PrivacyDecision {
  /** 是否允许采集（截图 / 识别画面） */
  capture: boolean;
  /** 拒绝原因（写日志/设置页展示用，不含标题原文） */
  reason: 'sensitive-app' | 'sensitive-title' | 'unknown-app' | 'paused' | 'ok';
  /** 命中的名单项（进程名或规则名），便于用户排查 */
  matched?: string;
}

/** 一条建议（Coach 产出；host 负责把它变成气泡 + 动作） */
export interface Suggestion {
  /** 去重键：同一应用同一次停留只建议一次（见 coach.ts） */
  key: string;
  /** 给宠物"说"的话 */
  text: string;
  /** 触发原因（debug / 设置页展示） */
  reason: 'dwell' | 'late-night' | 'long-idle';
  /** 产出时间 */
  at: number;
}

/** 记忆文档的元信息（INDEX.md 的一行） */
export interface MemoryDocMeta {
  /** 文件名（相对 memory/work/ 或 memory/companion/） */
  file: string;
  /** 人类可读标题 */
  title: string;
  /** 生成时间（ISO 字符串） */
  at: string;
  /** 归属会话 id（工作记忆有，陪伴记忆没有） */
  sessionId?: string;
  /** 关键词（本地抽取，供 index 检索） */
  tags: string[];
}
