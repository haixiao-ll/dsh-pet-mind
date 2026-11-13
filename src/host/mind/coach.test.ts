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

test('同一次停留只建议一次；30 分钟后才可能再来一条', () => {
  const h = harness();
  h.tick();
  h.adv(3 * 60_000);
  assert.ok(h.tick());
  h.adv(3 * 60_000);
  assert.equal(h.tick(), null, '冷却期内不再打扰');
  h.adv(30 * 60_000);
  assert.ok(h.tick(), '冷却结束后可以再建议');
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

test('每日上限 8 条', () => {
  const h = harness({ dailyLimit: 2, cooldownMinutes: 0 });
  h.tick();
  for (let i = 0; i < 5; i += 1) {
    h.adv(3 * 60_000);
    h.tick();
  }
  assert.equal(h.coach.countToday(), 2);
});

test('上下文提醒文案按档位区分', () => {
  assert.match(contextWarningText(0.8, 0.81), /81%/);
  assert.match(contextWarningText(0.95, 0.96), /不到 5%/);
});
