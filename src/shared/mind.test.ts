import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatTokens, readMindState, ringColor, ringTitle } from './mind.ts';

test('readMindState：正常形状能读出上下文与待机', () => {
  const view = readMindState({
    ok: true,
    enabled: true,
    context: { usedTokens: 80000, contextWindow: 128000, percent: 0.625, model: 'deepseek-chat' },
    activity: { standby: true, capture: true },
    memory: { docs: 3 },
  });
  assert.equal(view.enabled, true);
  assert.equal(view.context?.percent, 0.625);
  assert.equal(view.context?.model, 'deepseek-chat');
  assert.equal(view.standby, true);
  assert.equal(view.memoryDocs, 3);
});

test('readMindState：宿主返回残缺/垃圾数据时不抛，降级为空视图', () => {
  assert.deepEqual(readMindState(null), { enabled: false, context: null, standby: false, capture: false, reason: '', memoryDocs: 0 });
  assert.equal(readMindState({ ok: false }).context, null);
  assert.equal(readMindState({ context: 'nope' }).context, null);
  // usedTokens 缺失 → 不造一个 0 出来（0 会被画成"完全空闲"）
  assert.equal(readMindState({ context: { percent: 0.5 } }).context, null);
});

test('readMindState：percent 夹在 0–1，窗口非法时缺省', () => {
  const view = readMindState({ context: { usedTokens: 10, contextWindow: 0, percent: 1.7 } });
  assert.equal(view.context?.percent, 1);
  assert.equal(view.context?.contextWindow, undefined);
});

test('ringColor：80% / 95% 两个档位与宿主提醒一致', () => {
  assert.equal(ringColor(0.5), '#4ade80');
  assert.equal(ringColor(0.8), '#fbbf24');
  assert.equal(ringColor(0.95), '#f87171');
});

test('formatTokens / ringTitle', () => {
  assert.equal(formatTokens(79321), '79k');
  assert.equal(formatTokens(1_200_000), '1.2M');
  assert.equal(formatTokens(999), '999');
  assert.equal(ringTitle({ usedTokens: 80000, contextWindow: 128000, percent: 0.625 }), '上下文已用 63%（80k / 128k tokens）');
  assert.equal(ringTitle(null), undefined);
});
