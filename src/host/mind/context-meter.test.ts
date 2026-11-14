import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ContextMeter, ThresholdLatch, isMeteredSession, percentOf, usedTokensOf } from './context-meter.ts';

test('usedTokensOf：缓存读写与输出都算进"上下文已占用"', () => {
  assert.equal(usedTokensOf({ inputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 50, outputTokens: 30 }), 1080);
  // 只有 totalTokens 时兜底
  assert.equal(usedTokensOf({ totalTokens: 1234 }), 1234);
  // 完全没有数值 → undefined（不是 0：0 会被误当成"空闲"）
  assert.equal(usedTokensOf({}), undefined);
  assert.equal(usedTokensOf(undefined), undefined);
});

test('percentOf：窗口未知时返回 undefined 而不是 0，并夹在 0–1', () => {
  assert.equal(percentOf(50, 100), 0.5);
  assert.equal(percentOf(200, 100), 1);
  assert.equal(percentOf(50, undefined), undefined);
  assert.equal(percentOf(50, 0), undefined);
  assert.equal(percentOf(50, Number.NaN), undefined);
});

test('isMeteredSession：子代理/委派会话不占主对话的上下文窗口', () => {
  assert.equal(isMeteredSession({ header: { origin: 'subagent' } }), false);
  assert.equal(isMeteredSession({ header: { delegationDepth: 2 } }), false);
  assert.equal(isMeteredSession({ header: {} }), true);
  assert.equal(isMeteredSession(null), true);
});

test('ContextMeter：先 usage 后 window 也能补出百分比', () => {
  const meter = new ContextMeter();
  const session = { header: { id: 's1' } };
  meter.observe(session, { type: 'assistant/message', usage: { inputTokens: 4000, outputTokens: 1000 } });
  assert.equal(meter.snapshot('s1')?.usedTokens, 5000);
  assert.equal(meter.snapshot('s1')?.percent, undefined);
  meter.observe(session, { type: 'request/context', provider: 'deepseek', model: 'deepseek-chat', contextWindow: 10000 });
  const snap = meter.snapshot('s1');
  assert.equal(snap?.percent, 0.5);
  assert.equal(snap?.model, 'deepseek-chat');
  assert.equal(meter.latest()?.sessionId, 's1');
  meter.forget('s1');
  assert.equal(meter.size(), 0);
});

test('ThresholdLatch：80% 报过一次后不再重复，95% 才再提醒；新会话独立', () => {
  const latch = new ThresholdLatch();
  assert.equal(latch.check('a', 0.5, [0.8, 0.95]), undefined);
  assert.equal(latch.check('a', 0.81, [0.8, 0.95]), 0.8);
  assert.equal(latch.check('a', 0.82, [0.8, 0.95]), undefined);
  assert.equal(latch.check('a', 0.96, [0.8, 0.95]), 0.95);
  assert.equal(latch.check('b', 0.85, [0.8, 0.95]), 0.8);
  latch.forget('a');
  assert.equal(latch.check('a', 0.85, [0.8, 0.95]), 0.8);
});

test('DSH 事件载荷在 data 里（session.v4）：usage 与 contextWindow 都能读到', () => {
  const meter = new ContextMeter();
  const session = { header: { id: 's2' } };
  meter.observe(session, {
    type: 'request/context',
    data: { provider: 'deepseek-account', model: 'deepseek-flash', contextWindow: 1048576 },
  });
  meter.observe(session, {
    type: 'assistant/message',
    data: { usage: { inputTokens: 1103, outputTokens: 1566, cacheReadTokens: 11008, cacheWriteTokens: 0, totalTokens: 13677 } },
  });
  const snap = meter.snapshot('s2');
  assert.equal(snap?.usedTokens, 13677);
  assert.equal(snap?.contextWindow, 1048576);
  assert.ok((snap?.percent ?? 0) > 0.01 && (snap?.percent ?? 1) < 0.05);
  assert.equal(snap?.model, 'deepseek-flash');
});

test('setWindow：usage 先到、窗口后补（重启后 request/context 缺失的兜底）', () => {
  const meter = new ContextMeter();
  const session = { header: { id: 's3' } };
  meter.observe(session, { type: 'assistant/message', data: { usage: { inputTokens: 1000, outputTokens: 200 } } });
  assert.equal(meter.snapshot('s3')?.percent, undefined);
  meter.setWindow('s3', 10000);
  assert.equal(meter.snapshot('s3')?.contextWindow, 10000);
  assert.equal(meter.snapshot('s3')?.percent, 0.12);
  meter.setWindow('s3', 0);
  assert.equal(meter.snapshot('s3')?.contextWindow, 10000, '非法窗口不应覆盖');
});

test('seed：启动恢复的快照标记 stale，后续实时 usage 会覆盖它', () => {
  const meter = new ContextMeter();
  meter.seed({ sessionId: 's4', usedTokens: 100, contextWindow: 1000, percent: 0.1, at: 1 });
  assert.equal(meter.snapshot('s4')?.stale, true);
  meter.observe({ header: { id: 's4' } }, { type: 'assistant/message', data: { usage: { inputTokens: 500, outputTokens: 0 } } });
  assert.equal(meter.snapshot('s4')?.stale, undefined);
  assert.equal(meter.snapshot('s4')?.usedTokens, 500);
});
