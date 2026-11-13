/**
 * vision-model.ts —— 把"一帧屏幕"交给视觉模型，换一句**看着画面说**的建议。
 *
 * 为什么不用 DSH 的 `ctx.llm`：它的图片消息必须走 `ImageAttachmentRef`，那是**持久化附件**
 * （写进 DSH 的附件库，content-addressed，没有删除接口）。对"桌宠看一眼屏幕"来说，
 * 落一份副本既没必要也违背"只直播不录屏"。这里直接调一个 OpenAI 兼容端点，
 * 帧以 data URL 的形式只在内存里过一遍。
 *
 * 边界（全部在这里挡住，调用方不用再判断）：
 *   - 只接受 `data:image/jpeg;base64,...`，且长度上限（默认 ~1.4MB 字符）；
 *   - 端点必须是 http(s)，模型名必须非空，密钥从环境变量读（**不写进配置文件**）；
 *   - 超时（默认 20s）+ 失败返回结构化 reason，绝不抛到调用方；
 *   - 模型回 "SKIP"（看到密码/支付/私聊）时不算建议，调用方静默丢弃。
 */

/** 视觉分析配置（`mind.vision.analyze`，全部可选；不写 = 不启用） */
export interface VisionAnalyzeConfig {
  /** 总开关 */
  enabled?: boolean;
  /** OpenAI 兼容的 chat/completions 端点，例如 https://api.openai.com/v1/chat/completions */
  endpoint?: string;
  /** 模型名，例如 gpt-4o-mini / qwen-vl-max / glm-4v */
  model?: string;
  /** 从哪个环境变量读密钥（默认 OPENAI_API_KEY；**不要**把密钥写进配置文件） */
  apiKeyEnv?: string;
  /** 超时（ms，默认 20000） */
  timeoutMs?: number;
  /**
   * 是否允许所有"非敏感"应用出帧（默认 false）。
   * false 时只发 `mind.privacy.cloudAllowlist` 里显式列出的应用——这是之前的默认承诺；
   * 用户明确要为"所有界面"生成建议时，才把它打开。
   */
  allApps?: boolean;
  /** 建议文本上限（默认 80 字） */
  maxChars?: number;
}

/** 分析输入 */
export interface AnalyzeInput {
  /** data:image/jpeg;base64,... */
  imageDataUrl: string;
  /** 前台进程名（只作为上下文提示，不参与隐私判定——那一步在调用方） */
  app?: string;
}

export type AnalyzeResult = { ok: true; text: string } | { ok: false; reason: string; detail?: string };

/** 注入点（测试用；生产走全局 fetch/env） */
export interface AnalyzeDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

const MAX_DATA_URL = 1_400_000;

const SYSTEM_PROMPT =
  '你是一只桌面宠物，正陪主人工作。你会看到主人屏幕的一帧截图。' +
  '请用一句中文给主人一条**具体、有用**的建议（不超过 40 字）：' +
  '必须指向画面里真实存在的内容（比如正在读的标题、代码/报错、文档段落、网页要点），' +
  '不要泛泛地说“休息一下”“喝口水”，也不要描述你在看图。' +
  '如果画面涉及密码、支付、网银、私密聊天或其他不宜评论的内容，只回复 SKIP。';

/**
 * 调视觉模型给一句建议。
 * @param input 帧（data URL）与前台应用名
 * @param cfg 配置（endpoint/model 缺失即失败，不做本地兜底——用户要的就是"模型说的"）
 */
export async function analyzeScreen(
  input: AnalyzeInput,
  cfg: VisionAnalyzeConfig,
  deps: AnalyzeDeps = {},
): Promise<AnalyzeResult> {
  if (cfg.enabled !== true) return { ok: false, reason: 'disabled' };
  const endpoint = String(cfg.endpoint ?? '').trim();
  if (!/^https?:\/\//.test(endpoint)) return { ok: false, reason: 'bad-endpoint' };
  const model = String(cfg.model ?? '').trim();
  if (!model) return { ok: false, reason: 'bad-model' };

  const dataUrl = String(input.imageDataUrl ?? '');
  if (!dataUrl.startsWith('data:image/jpeg;base64,')) return { ok: false, reason: 'bad-image' };
  if (dataUrl.length > MAX_DATA_URL) return { ok: false, reason: 'image-too-large' };

  const env = deps.env ?? process.env;
  const keyName = String(cfg.apiKeyEnv ?? 'OPENAI_API_KEY').trim() || 'OPENAI_API_KEY';
  const apiKey = String(env[keyName] ?? '').trim();
  if (!apiKey) return { ok: false, reason: 'missing-api-key', detail: keyName };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = Math.min(60_000, Math.max(3_000, Number(cfg.timeoutMs) || 20_000));

  const userText = (input.app ? '前台应用：' + input.app + '。\n' : '') + '这是当前屏幕的一帧。请给一句建议。';
  const body = {
    model,
    temperature: 0.4,
    max_tokens: 160,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const json = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const raw = json?.choices?.[0]?.message?.content;
    const text = normalizeContent(raw).slice(0, Math.max(20, Number(cfg.maxChars) || 80));
    if (!text) return { ok: false, reason: 'empty' };
    if (/^skip$/i.test(text) || /^skip[.。!！]?$/i.test(text)) return { ok: false, reason: 'skip' };
    return { ok: true, text };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name ?? '';
    if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'network', detail: (error as Error)?.message };
  }
}

/** OpenAI 兼容端点的 content 可能是字符串，也可能是 [{type:'text',text}] 数组 */
function normalizeContent(raw: unknown): string {
  if (typeof raw === 'string') return clean(raw);
  if (Array.isArray(raw)) {
    const parts = raw
      .map((part) => {
        const p = part as { type?: unknown; text?: unknown };
        return p?.type === 'text' && typeof p.text === 'string' ? p.text : '';
      })
      .filter(Boolean);
    return clean(parts.join(' '));
  }
  return '';
}

/** 去掉引号/换行/前后空白；模型偶尔会用「」或英文引号包整句 */
function clean(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[「『"'“”]+|[」』"'“”]+$/g, '')
    .trim();
}
