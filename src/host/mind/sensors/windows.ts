/**
 * Windows 桌面活跃度采集器 —— "直播不录屏"的信息面。
 *
 * 只采两样东西：**系统空闲时长** 与 **前台进程名 + 窗口标题**。
 * 不截图、不录屏、不写文件，采样结果只在内存里传给 Coach 与隐私闸门。
 *
 * 为什么用常驻 PowerShell 而不是每次 spawn：
 *   - 一次 `powershell -Command` 冷启动约 200–400ms，5 秒一次会把 CPU 吃出锯齿；
 *   - 常驻进程里循环，间隔由脚本自己控制，Node 侧只读 stdout 的 JSON 行。
 *
 * 失败即降级（不是崩溃）：非 Windows / 执行策略禁止 / 没有 powershell.exe →
 * 采集器返回 unavailable，Coach 自然不发建议，宠物行为与改造前完全一致。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ActivitySample } from '../types';

/** 采集器句柄 */
export interface ActivityWatcher {
  stop(): void;
  /** 采集器是否真的在跑（false = 当前平台/环境不支持） */
  readonly running: boolean;
}

export interface WatcherOptions {
  /** 采样间隔（ms，默认 5000；最小 1000） */
  intervalMs?: number;
  /** 收到一条采样（已做 JSON 解析与字段归一） */
  onSample(sample: ActivitySample): void;
  /** 诊断日志（只在启动/异常时调用，不刷屏） */
  log?(message: string): void;
}

/**
 * 脚本路径：脚本随包发布，位于 `<包根>/scripts/mind/foreground-watch.ps1`。
 *
 * 两种运行形态的相对深度不同，所以按候选路径探测：
 *   - 构建产物 `lib/index.js` → `../scripts/mind/...`；
 *   - 源码直跑（node --experimental-strip-types / 单测）`src/host/mind/sensors/windows.ts`
 *     → 上四层才是包根。
 * 都找不到时返回产物形态那条（调用方 existsSync 失败会优雅降级，不会崩）。
 */
export function watcherScriptPath(): string {
  const candidates = [
    fileURLToPath(new URL('../scripts/mind/foreground-watch.ps1', import.meta.url)),
    fileURLToPath(new URL('../../../../scripts/mind/foreground-watch.ps1', import.meta.url)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/**
 * 解析脚本输出的一行 JSON。
 *
 * 形状：`{"ts":1699...,"idleMs":1234,"app":"Code.exe","title":"main.ts - dsh-pet"}`
 * 容错：字段缺失/类型不对一律丢弃该字段（app/title 缺失 → 后续按"未知应用"处理）。
 */
export function parseSampleLine(line: string): ActivitySample | undefined {
  const text = line.trim();
  if (!text.startsWith('{')) return undefined;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const idle = Number(raw.idleMs);
    const app = typeof raw.app === 'string' ? raw.app.trim() : undefined;
    const title = typeof raw.title === 'string' ? raw.title : undefined;
    return {
      at: Date.now(),
      idleMs: Number.isFinite(idle) && idle >= 0 ? idle : 0,
      ...(app ? { app } : {}),
      ...(title ? { title } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * 启动采集器。
 *
 * 只在 win32 上尝试；其它平台直接返回未运行（桌宠本身跨平台，心智层按平台降级）。
 */
export function startWindowsActivityWatcher(opts: WatcherOptions): ActivityWatcher {
  const interval = Math.max(1000, opts.intervalMs ?? 5000);
  const script = watcherScriptPath();
  const log = opts.log ?? (() => {});

  if (process.platform !== 'win32') {
    return { running: false, stop() {} };
  }
  if (!existsSync(script)) {
    log(`采集脚本不存在，跳过桌面感知：${script}`);
    return { running: false, stop() {} };
  }

  let child: ReturnType<typeof spawn> | undefined;
  let buffer = '';
  let stopped = false;

  try {
    const spawned = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        '-IntervalMs',
        String(interval),
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child = spawned;
    if (!spawned.stdout || !spawned.stderr) {
      log('桌面感知：stdout/stderr 管道不可用');
      spawned.kill();
      return { running: false, stop() {} };
    }
    spawned.stdout.setEncoding('utf8');
    spawned.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      // 按行切；保留最后一段不完整行等下次拼接
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const sample = parseSampleLine(line);
        if (sample && !stopped) opts.onSample(sample);
      }
    });
    // stderr 只在开头提示一次：执行策略/权限问题排查用，不逐行刷
    let warned = false;
    spawned.stderr.setEncoding('utf8');
    spawned.stderr.on('data', (chunk: string) => {
      if (warned) return;
      warned = true;
      log(`桌面感知 stderr：${chunk.slice(0, 300).trim()}`);
    });
    spawned.on('error', (error) => {
      log(`桌面感知进程错误：${error.message}`);
    });
  } catch (error) {
    log(`启动桌面感知失败：${(error as Error).message}`);
    return { running: false, stop() {} };
  }

  return {
    get running(): boolean {
      return !stopped && child !== undefined;
    },
    stop(): void {
      stopped = true;
      try {
        child?.kill();
      } catch {
        /* 进程已退出 */
      }
    },
  };
}
