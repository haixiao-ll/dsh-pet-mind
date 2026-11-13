import assert from 'node:assert/strict';
import { test } from 'node:test';

import { automaticWhisperSchedule } from './whisper-policy.ts';

test('本地碎碎念只看宠物开关与配置周期（不再看 DSH 的 AI 策略）', () => {
  assert.deepEqual(automaticWhisperSchedule(true, 125), { enabled: true, periodSec: 125 });
  assert.deepEqual(automaticWhisperSchedule(false, 125), { enabled: false, periodSec: 125 });
});

test('周期下限 60s：填得再小也不会变成高频请求（本地语句池虽然不花钱，但别刷屏）', () => {
  assert.equal(automaticWhisperSchedule(true, 5).periodSec, 60);
  assert.equal(automaticWhisperSchedule(true, 60).periodSec, 60);
});

test('非法/缺省周期回落到 300s，但不影响 enabled——开关是开关，周期是周期', () => {
  assert.equal(automaticWhisperSchedule(true, 0).periodSec, 300);
  assert.equal(automaticWhisperSchedule(true, -1).periodSec, 300);
  assert.equal(automaticWhisperSchedule(true, Number.NaN).periodSec, 300);
  assert.equal(automaticWhisperSchedule(true, Number.POSITIVE_INFINITY).periodSec, 300);
  assert.equal(automaticWhisperSchedule(true, 0).enabled, true);
});
