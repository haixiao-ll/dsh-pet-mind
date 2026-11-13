import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { largestRectOutside } = require('../../../runtime/electron-helper/capture-region.js');

const SIZE = { width: 640, height: 360 };

test('没有宠物窗口时返回整帧', () => {
  assert.deepEqual(largestRectOutside(SIZE, []), { x: 0, y: 0, width: 640, height: 360 });
});

test('宠物在左上角：裁到右侧/下方更大的一侧', () => {
  const rect = largestRectOutside(SIZE, [{ x: 0, y: 0, width: 120, height: 100 }]);
  // 右: 520×360 = 187200；下: 640×260 = 166400 → 取右侧
  assert.equal(rect.width * rect.height, 520 * 360);
  assert.equal(rect.x, 120);
});

test('宠物是左侧整条竖带：只能取右侧（上/下都为空）', () => {
  const rect = largestRectOutside(SIZE, [{ x: 0, y: 0, width: 160, height: 360 }]);
  assert.deepEqual(rect, { x: 160, y: 0, width: 480, height: 360 });
});

test('宠物在右下角：裁到上方或左侧，且不含宠物区域', () => {
  const pet = { x: 440, y: 220, width: 200, height: 140 };
  const rect = largestRectOutside(SIZE, [pet]);
  const overlapX = Math.max(0, Math.min(rect.x + rect.width, pet.x + pet.width) - Math.max(rect.x, pet.x));
  const overlapY = Math.max(0, Math.min(rect.y + rect.height, pet.y + pet.height) - Math.max(rect.y, pet.y));
  assert.equal(overlapX * overlapY, 0, '观测区不能与宠物重叠');
  assert.ok(rect.width * rect.height > 640 * 360 * 0.2, '也要留足够大的观测面积');
});

test('两个宠物窗口：依次抠掉', () => {
  const rect = largestRectOutside(SIZE, [
    { x: 0, y: 0, width: 100, height: 90 },
    { x: 540, y: 270, width: 100, height: 90 },
  ]);
  assert.ok(rect.width > 0 && rect.height > 0);
  assert.ok(rect.width * rect.height > 640 * 360 * 0.2);
});

test('抠完太小（<1/16）时退回整帧，避免用一小块画面瞎判断', () => {
  const rect = largestRectOutside(SIZE, [{ x: 0, y: 0, width: 636, height: 356 }]);
  assert.deepEqual(rect, { x: 0, y: 0, width: 640, height: 360 });
});
