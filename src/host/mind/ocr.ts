/**
 * OCR —— 把一帧画面转成"DSH 看得懂的文字"，全程本地。
 *
 * 为什么用 Windows 自带 OCR：它随系统语言包安装，不联网、不下模型、不需要管理员权限；
 * 也不用装 Tesseract/Python。代价是识别质量取决于系统语言包与画面清晰度——够用来
 * "知道你在看什么"，不够用来做精确抄录。
 *
 * 数据边界：
 *   - 图片以 base64 从 **stdin** 进入 PowerShell，在内存里解码（InMemoryRandomAccessStream），
 *     **不写临时文件**；识别完进程退出，内存随进程释放；
 *   - 不联网、不调用任何模型；
 *   - 只把识别出的文字返回给宿主；文字随后会作为 prompt 的一部分交给**当前文本模型**。
 *
 * 失败语义：脚本缺失/超时/引擎不存在/没有文字 → `{ok:false, reason}`，
 * 调用方据此"不打扰"（不伪造建议）。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** OCR 结果 */
export type OcrResult = { ok: true; text: string } | { ok: false; reason: string };

export interface OcrOptions {
  /** 超时（ms，默认 8000；OCR 通常 0.3–1.5s） */
  timeoutMs?: number;
  /** 注入执行器（测试用）：返回 stdout */
  run?: (base64: string) => Promise<string>;
}

/** 脚本路径：两种运行形态（产物 lib/index.js / 源码 src/host/mind/ocr.ts）分别探测 */
export function ocrScriptPath(): string {
  const candidates = [
    fileURLToPath(new URL('../scripts/mind/ocr.ps1', import.meta.url)),
    // src/host/mind/ocr.ts → 上三层才是包根（与 sensors/windows.ts 的深度不同，别照抄）
    fileURLToPath(new URL('../../../scripts/mind/ocr.ps1', import.meta.url)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/**
 * 规整 OCR 输出：
 *   - Windows OCR 会在**每个汉字之间插空格**（"你 好"），这里合并；
 *   - 折行压成空格、连续空白压成一个；
 *   - 截断到 maxChars（默认 2000）——prompt 里只放得下摘要级文本。
 */
export function normalizeOcrText(raw: string, maxChars = 2000): string {
  const NL = String.fromCharCode(10);
  const isSpace = (code: number): boolean => code === 32 || code === 13 || code === 0xa0;
  const isCjk = (code: number): boolean =>
    (code >= 0x3400 && code <= 0x9fff) || (code >= 0x3000 && code <= 0x303f) || (code >= 0xff00 && code <= 0xffef);

  const source = String(raw ?? '');
  // 1) 空白归一：换行留成换行标记（不然两行会被粘成一句），其余空白压成一个空格
  let collapsed = '';
  for (const ch of source) {
    const code = ch.codePointAt(0) ?? 0;
    // 制表符按“结构分隔”处理（当换行），否则它会被当成 OCR 逐字插的空格而删掉
    if (code === 10 || code === 13 || code === 9) {
      if (!collapsed.endsWith(NL)) collapsed += NL;
      continue;
    }
    if (isSpace(code)) {
      if (!collapsed.endsWith(' ') && !collapsed.endsWith(NL)) collapsed += ' ';
      continue;
    }
    collapsed += ch;
  }

  // 2) 去掉"汉字/全角标点之间"那个空格（Windows OCR 逐字插的空格），英文单词之间的保留
  let joined = '';
  for (let i = 0; i < collapsed.length; i += 1) {
    const ch = collapsed[i];
    if (ch === ' ') {
      const prev = joined.codePointAt(joined.length - 1) ?? 0;
      const next = collapsed.codePointAt(i + 1) ?? 0;
      if (joined.length > 0 && isCjk(prev) && isCjk(next)) continue;
    }
    joined += ch;
  }

  // 3) 换行 → 空格，并把连续空格压成一个
  let out = '';
  for (const ch of joined) {
    if (ch === NL) {
      if (!out.endsWith(' ')) out += ' ';
      continue;
    }
    if (ch === ' ') {
      if (!out.endsWith(' ')) out += ' ';
      continue;
    }
    out += ch;
  }
  out = out.trim();
  return out.length > maxChars ? out.slice(0, maxChars) : out;
}

/** 默认执行器：spawn powershell，把 base64 写进 stdin，收 UTF-8 stdout */
function runPowerShell(script: string, timeoutMs: number): (base64: string) => Promise<string> {
  return (base64: string) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* 已退出 */
        }
        reject(new Error('ocr-timeout'));
      }, timeoutMs);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        out += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        err += chunk;
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error('ocr-exit-' + code + (err ? ':' + err.slice(0, 200) : '')));
      });
      child.stdin.end(base64, 'utf8');
    });
}

/**
 * 把一帧 data URL 转成文字。
 * @param dataUrl `data:image/jpeg;base64,...`（只认 jpeg/png）
 */
export async function ocrDataUrl(dataUrl: string, options: OcrOptions = {}): Promise<OcrResult> {
  const match = /^data:image\/(?:jpeg|jpg|png);base64,(.+)$/.exec(String(dataUrl ?? ''));
  if (!match) return { ok: false, reason: 'bad-image' };
  const base64 = match[1];
  if (base64.length === 0 || base64.length > 2_000_000) return { ok: false, reason: 'image-too-large' };
  // 平台判断放在参数校验之后：非法 data URL 在哪个平台都应该报 bad-image；
  // 注入执行器时（单测）跳过平台门，否则 Linux CI 永远到不了执行器。
  if (!options.run && process.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' };

  const timeoutMs = Math.min(20_000, Math.max(2_000, Number(options.timeoutMs) || 8_000));
  const script = ocrScriptPath();
  const run = options.run ?? runPowerShell(script, timeoutMs);

  try {
    const raw = await run(base64);
    // 脚本的固定信号量（不是文字）
    if (raw.trim() === 'NO_ENGINE') return { ok: false, reason: 'no-engine' };
    if (raw.trim() === 'NO_INPUT' || raw.trim() === 'BAD_BASE64') return { ok: false, reason: 'bad-image' };
    const text = normalizeOcrText(raw);
    if (text.length < 2) return { ok: false, reason: 'empty' };
    return { ok: true, text };
  } catch (error) {
    const message = (error as Error)?.message ?? 'unknown';
    // 排障开关：DSH_PET_OCR_DEBUG=1 时把真实原因打到 stderr（默认静默）
    if (process.env.DSH_PET_OCR_DEBUG === '1') console.warn('[dsh-pet] OCR 失败：' + message);
    return { ok: false, reason: message === 'ocr-timeout' ? 'timeout' : 'failed' };
  }
}
