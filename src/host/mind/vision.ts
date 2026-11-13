/**
 * Vision —— 「只直播、不录屏」的截帧闸门（纯逻辑，可单测）。
 *
 * 每帧都在 Electron Helper 的**内存**里生成：主进程截一张 640×360 的缩略图，
 * 立刻算一个采样哈希，把 `{hash, width, height}` 回给宿主，图像对象随作用域销毁。
 * **不写文件、不进附件库、不发网络、不进日志**。
 *
 * 这帧用来干什么：给「人到底在不在」加一条硬证据。
 *   - 系统空闲 ≥5 分钟，本来会待机；
 *   - 但如果屏幕内容**还在变**（视频在播 / 有人滚页面 / 远程输入），说明人其实在，
 *     这时候待机就是误判。所以「最近 changeWindowMs 内屏幕变过」→ 不待机。
 *
 * 为什么不在宿主里直接截：宿主是 Node 进程，没有 Electron 的 desktopCapturer；
 * 而 Helper 本来就在渲染桌宠，截屏是它天然的能力，也符合「像素只经过 Helper」的约定。
 *
 * 隐私：
 *   - 只有 `mind.vision.enabled=true` 才会请求截帧（默认关闭）；
 *   - 每次请求前都先过 privacy.ts（敏感应用 → 不请求）；
 *   - 宿主只保存哈希与时间，**不保存任何像素**；
 *   - 请求带一次性 id + TTL，过期帧直接丢弃（迟到的帧不会覆盖新状态）。
 */

/** Helper 回传的一帧摘要（**没有像素**） */
export interface FrameSignal {
  /** 与请求配对的 id */
  id: string;
  /** 采样哈希（十六进制字符串；两帧相同 = 画面没变） */
  hash: string;
  /** 缩略图尺寸（诊断用） */
  width: number;
  height: number;
  /** 仅"视觉建议"模式才带：data:image/jpeg;base64,...（宿主只在内存里转发给模型，不落盘） */
  dataUrl?: string;
}

/** 闸门判定结果 */
export interface FrameAccept {
  ok: boolean;
  /** 这次帧与上一帧是否不同（第一帧恒为 true） */
  changed: boolean;
  reason?: 'no-pending' | 'stale' | 'bad-id' | 'bad-payload';
}

/**
 * 截帧请求闸门。
 *
 * 生命周期：`request()` 发出一次性 id → Helper 回来 `accept()` →
 * 更新 lastHash / lastChangeAt。任何一步不合法都只影响"这次信号"，不影响桌宠。
 */
export class FrameGate {
  private pending: { id: string; at: number } | null = null;
  private lastHash = '';
  private lastChangeAt = 0;
  private lastFrameAt = 0;
  private seq = 0;

  /** 发一次请求；返回一次性 id（同一时刻只允许一个未完成的请求） */
  request(now = Date.now()): string {
    this.seq += 1;
    const id = `${now.toString(36)}-${this.seq.toString(36)}`;
    this.pending = { id, at: now };
    return id;
  }

  /** 有没有还没回音的请求（宿主据此决定要不要在 S 里带 captureRequest） */
  hasPending(now = Date.now(), ttlMs = 10_000): boolean {
    if (!this.pending) return false;
    return now - this.pending.at <= ttlMs;
  }

  /** 当前待处理请求的 id（没有/过期 → undefined） */
  pendingId(now = Date.now(), ttlMs = 10_000): string | undefined {
    if (!this.pending) return undefined;
    return now - this.pending.at <= ttlMs ? this.pending.id : undefined;
  }

  /** 收一帧：校验 id/形状，更新哈希与"最近变化时间" */
  accept(frame: FrameSignal, now = Date.now(), ttlMs = 10_000): FrameAccept {
    if (!this.pending) return { ok: false, changed: false, reason: 'no-pending' };
    if (now - this.pending.at > ttlMs) {
      this.pending = null;
      return { ok: false, changed: false, reason: 'stale' };
    }
    if (!frame || typeof frame.hash !== 'string' || frame.hash === '' || frame.id !== this.pending.id) {
      return { ok: false, changed: false, reason: frame?.id === this.pending.id ? 'bad-payload' : 'bad-id' };
    }
    const changed = this.lastHash === '' ? true : frame.hash !== this.lastHash;
    this.lastHash = frame.hash;
    this.lastFrameAt = now;
    if (changed) this.lastChangeAt = now;
    this.pending = null;
    return { ok: true, changed };
  }

  /** 最近 windowMs 内屏幕变过吗（待机判定的"人可能在"证据） */
  changedRecently(now = Date.now(), windowMs = 120_000): boolean {
    return this.lastChangeAt > 0 && now - this.lastChangeAt <= windowMs;
  }

  /** 最近一次"屏幕变化"的时间（0 = 还没有有效帧） */
  lastChange(): number {
    return this.lastChangeAt;
  }

  /** 最近一次收到有效帧的时间（0 = 还没有） */
  lastFrame(): number {
    return this.lastFrameAt;
  }

  /** 测试/诊断：清空内部状态 */
  reset(): void {
    this.pending = null;
    this.lastHash = '';
    this.lastChangeAt = 0;
    this.lastFrameAt = 0;
  }
}
