import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeScreen, type VisionAnalyzeConfig } from './vision-model.ts';

const IMAGE = 'data:image/jpeg;base64,' + 'A'.repeat(200);
const CFG: VisionAnalyzeConfig = {
  enabled: true,
  endpoint: 'https://example.test/v1/chat/completions',
  model: 'vision-test',
  apiKeyEnv: 'TEST_VISION_KEY',
};
const ENV = { TEST_VISION_KEY: 'sk-test' } as NodeJS.ProcessEnv;

function stubFetch(reply: { status?: number; json?: unknown; throwErr?: Error }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (reply.throwErr) throw reply.throwErr;
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.json,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test('成功：把图片与提示发给端点，返回清理后的文本', async () => {
  const { fetchImpl, calls } = stubFetch({ json: { choices: [{ message: { content: '「这段报错是 TS2339，先补类型」' } }] } });
  const r = await analyzeScreen({ imageDataUrl: IMAGE, app: 'Code' }, CFG, { fetchImpl, env: ENV });
  assert.deepEqual(r, { ok: true, text: '这段报错是 TS2339，先补类型' });
  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model, 'vision-test');
  assert.equal(body.messages[1].content[1].image_url.url, IMAGE);
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer sk-test');
});

test('模型回 SKIP（私密内容）：不算建议', async () => {
  const { fetchImpl } = stubFetch({ json: { choices: [{ message: { content: 'SKIP' } }] } });
  const r = await analyzeScreen({ imageDataUrl: IMAGE }, CFG, { fetchImpl, env: ENV });
  assert.deepEqual(r, { ok: false, reason: 'skip' });
});

test('配置缺失/图片不合法时不发请求', async () => {
  const { fetchImpl, calls } = stubFetch({ json: {} });
  assert.equal((await analyzeScreen({ imageDataUrl: IMAGE }, { ...CFG, enabled: false }, { fetchImpl, env: ENV })).ok, false);
  assert.equal((await analyzeScreen({ imageDataUrl: IMAGE }, { ...CFG, endpoint: 'ftp://x' }, { fetchImpl, env: ENV })).ok, false);
  assert.equal((await analyzeScreen({ imageDataUrl: 'data:image/png;base64,AA' }, CFG, { fetchImpl, env: ENV })).ok, false);
  assert.equal(calls.length, 0);
});

test('缺密钥 / HTTP 错误 / 空回复 都给出结构化 reason', async () => {
  const { fetchImpl } = stubFetch({ json: {} });
  const noKey = await analyzeScreen({ imageDataUrl: IMAGE }, CFG, { fetchImpl, env: {} as NodeJS.ProcessEnv });
  assert.equal(noKey.ok, false);
  assert.equal((noKey as { reason: string }).reason, 'missing-api-key');

  const { fetchImpl: f500 } = stubFetch({ status: 500, json: {} });
  const r500 = await analyzeScreen({ imageDataUrl: IMAGE }, CFG, { fetchImpl: f500, env: ENV });
  assert.deepEqual(r500, { ok: false, reason: 'http-500' });

  const { fetchImpl: fEmpty } = stubFetch({ json: { choices: [{ message: { content: '   ' } }] } });
  assert.equal((await analyzeScreen({ imageDataUrl: IMAGE }, CFG, { fetchImpl: fEmpty, env: ENV })).ok, false);
});

test('网络异常/超时收敛成 reason，不抛', async () => {
  const timeout = new Error('timed out');
  timeout.name = 'TimeoutError';
  const { fetchImpl } = stubFetch({ throwErr: timeout });
  const r = await analyzeScreen({ imageDataUrl: IMAGE }, CFG, { fetchImpl, env: ENV });
  assert.deepEqual(r, { ok: false, reason: 'timeout' });
});

test('content 为分段数组时也能拼出文本', async () => {
  const { fetchImpl } = stubFetch({
    json: { choices: [{ message: { content: [{ type: 'text', text: '你正在看 ' }, { type: 'text', text: '上下文用量的代码' }] } }] },
  });
  const r = await analyzeScreen({ imageDataUrl: IMAGE }, CFG, { fetchImpl, env: ENV });
  assert.deepEqual(r, { ok: true, text: '你正在看 上下文用量的代码' });
});

test('超大图片直接拒绝（不把几十 MB 的 base64 发给服务商）', async () => {
  const huge = 'data:image/jpeg;base64,' + 'A'.repeat(1_400_001);
  const { fetchImpl, calls } = stubFetch({ json: {} });
  const r = await analyzeScreen({ imageDataUrl: huge }, CFG, { fetchImpl, env: ENV });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});
