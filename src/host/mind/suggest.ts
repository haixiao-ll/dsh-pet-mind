/**
 * suggest.ts —— "OCR 文本 → 建议 prompt / 文案清洗"的纯逻辑。
 *
 * 抽出来的原因：真正的模型调用在 host（依赖 ctx.llm，没法单测），但
 * "发给模型的提示词长什么样、模型乱答时怎么收口"是纯函数，必须能测。
 */

export interface SuggestPromptInput {
  /** OCR 出来的屏幕文字 */
  text: string;
  /** 前台应用名（只作为上下文，不参与隐私判定） */
  app?: string;
  /** 建议文案上限（默认 40 字） */
  maxChars?: number;
}

export interface SuggestPrompt {
  system: string;
  user: string;
  maxChars: number;
}

/** 屏幕文字进 prompt 的上限：OCR 可能很长，全塞进去既贵又容易被模型复述 */
const MAX_OCR_CHARS = 1200;

export function buildSuggestionPrompt(input: SuggestPromptInput): SuggestPrompt {
  const app = String(input.app ?? '').trim() || '未知';
  const text = String(input.text ?? '').slice(0, MAX_OCR_CHARS);
  const maxChars = clampChars(input.maxChars);
  return {
    system:
      '你是桌面宠物，正陪主人工作。下面是从主人屏幕 OCR 出来的文字（可能有错漏、乱码）。' +
      '请用一句中文给一条**具体**建议（不超过 40 字），要指向文字里真实出现的东西；' +
      '不要泛泛地说“休息一下”，不要复述整段，不要解释你在 OCR。' +
      '如果内容涉及密码、支付、私聊等不宜评论的内容，只回复 SKIP。',
    user: ['前台应用：' + app + '。', '屏幕文字：', text].join(String.fromCharCode(10)),
    maxChars,
  };
}

/** 文案上限：20–120 字之间，非法值回落 40 */
export function clampChars(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 40;
  return Math.min(120, Math.max(20, Math.floor(n)));
}

/**
 * 模型返回 → 可放进气泡的一句话。
 * - 压掉换行/连续空白（气泡是单行）；
 * - 去掉包裹的引号；
 * - SKIP / 跳过 / 空 → null（调用方据此"不弹"）。
 */
export function cleanSuggestion(raw: string, maxChars = 40): string | null {
  let text = '';
  for (const ch of String(raw ?? '')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 10 || code === 13 || code === 9 || code === 32 || code === 0xa0) {
      if (!text.endsWith(' ')) text += ' ';
      continue;
    }
    text += ch;
  }
  text = text.trim().replace(/^[「『"'“”]+|[」』"'“”]+$/g, '').trim();
  if (!text) return null;
  if (/^(skip|跳过|略过)/i.test(text)) return null;
  const limit = clampChars(maxChars);
  return text.length > limit ? text.slice(0, limit) : text;
}
