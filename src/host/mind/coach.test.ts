import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Coach, contextWarningText, type CoachConfig } from './coach.ts';
import type { ActivitySample } from './types';

const T0 = new Date('2026-11-13T14:00:00').getTime();

function harness(cfg: CoachConfig = {}) {
  let now = T0;
  const coach = new Coach({ now: () => now, random: () => 0 });
  const sample = (over: Partial<ActivitySample> = {}): ActivitySample => ({
    at: now,
    idleMs: 0,
    app: 'Code',
    title: 'main.ts - dsh-pet',
    ...over,
  });
  return {
    coach,
    cfg,
    sample,
    adv(ms: number) {
      now += ms;
    },
    tick(over: Partial<ActivitySample> = {}) {
      return coach.evaluate(sample(over), true, cfg);
    },
  };
}

test('停留不足 3 分钟不建议；满 3 分钟建议一次', () => {
  const h = harness();
  h.tick();
  h.adv(2 * 60_000);
  const quiet = h.tick();
  assert.equal(quiet, null);
  h.adv(61_000);
  const first = h.tick();
  assert.ok(first);
  assert.equal(first?.reason, 'dwell');
  assert.match(first!.text, /[。？！?!]$/);
});

test('一次停留只建议一次：同一页面等多久都不再来；标题变了才算新页面', () => {
  const h = harness();
  h.tick();
  h.adv(3 * 60_000);
  assert.ok(h.tick());
  h.adv(30 * 60_000);
  assert.equal(h.tick(), null, '同一停留不再建议（没有冷却这回事）');
  // 浏览器切标签 / IDE 切文件 = 标题变化 = 新页面
  h.tick({ title: '另一个页面' });
  h.adv(3 * 60_000);
  assert.ok(h.tick({ title: '另一个页面' }), '标题变化后重新给一次机会');
});

test('换应用 = 重新计时', () => {
  const h = harness();
  h.tick();
  h.adv(2 * 60_000);
  h.tick({ app: 'chrome' });
  h.adv(61_000);
  assert.equal(h.tick({ app: 'chrome' }), null, '刚换应用不足 3 分钟');
  h.adv(3 * 60_000);
  assert.ok(h.tick({ app: 'chrome' }));
});

test('人不在（空闲超 5 分钟）：不建议', () => {
  const h = harness();
  h.tick();
  h.adv(3 * 60_000);
  assert.equal(h.tick({ idleMs: 6 * 60_000 }), null);
  assert.equal(h.coach.isStandby(h.sample({ idleMs: 6 * 60_000 }), h.cfg), true);
});

test('隐私被拦（canCapture=false）：不计时、不建议', () => {
  const h = harness();
  h.tick();
  h.adv(3 * 60_000);
  assert.equal(h.coach.evaluate(h.sample(), false, h.cfg), null);
});

test('夜间免打扰默认 [23,8)', () => {
  const coach = new Coach({ now: () => T0 });
  assert.equal(coach.isQuietHour(new Date('2026-11-13T23:30:00').getTime()), true);
  assert.equal(coach.isQuietHour(new Date('2026-11-13T07:59:00').getTime()), true);
  assert.equal(coach.isQuietHour(new Date('2026-11-13T09:00:00').getTime()), false);
});

test('每日上限：全局计数，换页面也不再给', () => {
  const h = harness({ dailyLimit: 2 });
  for (let i = 0; i < 5; i += 1) {
    const title = 'page-' + i; // 每次都是新页面
    h.tick({ title });
    h.adv(3 * 60_000);
    h.tick({ title });
  }
  assert.equal(h.coach.countToday(), 2);
});

test('上下文提醒文案按档位区分', () => {
  assert.match(contextWarningText(0.8, 0.81), /81%/);
  assert.match(contextWarningText(0.95, 0.96), /不到 5%/);
});

test('dwellSec：30 秒触发；同一次停留不会再来第二次', () => {
  const h = harness({ dwellSec: 30 });
  h.tick();
  h.adv(29_000);
  assert.equal(h.tick(), null);
  h.adv(2_000);
  assert.ok(h.tick(), '满 30 秒应建议');
  h.adv(31_000);
  assert.equal(h.tick(), null, '同一次停留只建议一次');
});

test('额度只在建议真的弹出后计入：due 通过但未 commit 时不占额度', () => {
  const h = harness({ dwellSec: 30, dailyLimit: 6 });
  h.tick();
  h.adv(31_000);
  assert.equal(h.coach.due(h.sample(), true, h.cfg), true, '到点应允许一次');
  assert.equal(h.coach.countToday(), 0, '还没弹（OCR/模型可能失败）不占额度');
  h.coach.commitSuggestion();
  assert.equal(h.coach.countToday(), 1, '弹出后才计入');
  // 同一次停留不会因为失败而重试（避免每 30 秒空转）
  h.adv(31_000);
  assert.equal(h.coach.due(h.sample(), true, h.cfg), false);
});
