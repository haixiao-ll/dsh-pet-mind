import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FrameGate } from './vision.ts';

const T0 = 1_700_000_000_000;

test('request → accept：第一帧算变化，第二帧同哈希不算', () => {
  const gate = new FrameGate();
  const id1 = gate.request(T0);
  const r1 = gate.accept({ id: id1, hash: 'aaa', width: 640, height: 360 }, T0 + 500);
  assert.deepEqual(r1, { ok: true, changed: true });
  const id2 = gate.request(T0 + 1000);
  const r2 = gate.accept({ id: id2, hash: 'aaa', width: 640, height: 360 }, T0 + 1500);
  assert.deepEqual(r2, { ok: true, changed: false });
});

test('屏幕变化会刷新"最近变化"时间窗', () => {
  const gate = new FrameGate();
  const id = gate.request(T0);
  gate.accept({ id, hash: 'a', width: 640, height: 360 }, T0);
  assert.equal(gate.changedRecently(T0 + 60_000, 120_000), true);
  assert.equal(gate.changedRecently(T0 + 180_000, 120_000), false);

  const id2 = gate.request(T0 + 200_000);
  gate.accept({ id: id2, hash: 'b', width: 640, height: 360 }, T0 + 200_100);
  assert.equal(gate.changedRecently(T0 + 260_000, 120_000), true);
});

test('过期请求 / 错 id / 坏载荷都被拒，且不会污染状态', () => {
  const gate = new FrameGate();
  const id = gate.request(T0);
  // 过期
  assert.deepEqual(gate.accept({ id, hash: 'x', width: 1, height: 1 }, T0 + 20_000), {
    ok: false,
    changed: false,
    reason: 'stale',
  });
  // 没有 pending
  assert.equal(gate.accept({ id: 'whatever', hash: 'x', width: 1, height: 1 }, T0).reason, 'no-pending');

  const id2 = gate.request(T0 + 1000);
  assert.equal(gate.accept({ id: 'wrong', hash: 'x', width: 1, height: 1 }, T0 + 1100).reason, 'bad-id');
  assert.equal(gate.accept({ id: id2, hash: '', width: 1, height: 1 }, T0 + 1100).reason, 'bad-payload');
  // 坏帧不应清掉 pending，合法帧仍可被接受
  const ok = gate.accept({ id: id2, hash: 'z', width: 640, height: 360 }, T0 + 1200);
  assert.equal(ok.ok, true);
});

test('pendingId / hasPending 受 TTL 约束', () => {
  const gate = new FrameGate();
  const id = gate.request(T0);
  assert.equal(gate.pendingId(T0 + 1000, 10_000), id);
  assert.equal(gate.hasPending(T0 + 1000, 10_000), true);
  assert.equal(gate.pendingId(T0 + 20_000, 10_000), undefined);
  assert.equal(gate.hasPending(T0 + 20_000, 10_000), false);
});

test('reset 后回到"从没有帧"的状态', () => {
  const gate = new FrameGate();
  const id = gate.request(T0);
  gate.accept({ id, hash: 'a', width: 640, height: 360 }, T0);
  gate.reset();
  assert.equal(gate.lastFrame(), 0);
  assert.equal(gate.changedRecently(T0 + 1000), false);
});

// ---- 源码守卫：Helper 侧的截帧管线必须"只回哈希、不落盘" ----
import { readFileSync } from 'node:fs';

const helper = (name: string): string => readFileSync(new URL('../../../runtime/electron-helper/' + name, import.meta.url), 'utf8');

test('桌面 Helper 有截帧 IPC，且只回哈希（源码守卫）', () => {
  const main = helper('main.js');
  const start = main.indexOf("ipcMain.handle('pet:capture-thumb'");
  assert.ok(start >= 0, 'main.js 缺少 pet:capture-thumb 处理器');
  assert.ok(/desktopCapturer\.getSources/.test(main), '截帧必须用 desktopCapturer');
  // 处理器体内不得出现任何写盘调用（帧只活在内存里）
  const body = main.slice(start, start + 2000);
  assert.ok(!/writeFile|createWriteStream|appendFile/.test(body), '截帧处理器不得写文件');
  assert.ok(/thumbnailSize/.test(body), '必须限制缩略图尺寸（640×360）');

  const preload = helper('preload.js');
  assert.ok(/captureThumb\(options\)/.test(preload), 'preload 必须暴露 captureThumb(options)');

  const events = helper('events.js');
  assert.ok(/\/mind\/frame/.test(events), 'events.js 必须把哈希回传宿主');
  // 视觉模式才带图：必须由 capture.image===true 显式触发，默认路径仍只回哈希
  assert.ok(/capture\.image === true/.test(events), '只有视觉模式才能请求带图');
  assert.ok(/dataUrl: frame\.dataUrl/.test(events), '带图时把 dataUrl 回传（仅内存）');
});
