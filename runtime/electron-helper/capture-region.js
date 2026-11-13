/**
 * capture-region.js —— 计算"把桌宠自己抠掉之后"的截帧区域。
 *
 * 为什么需要它（实跑发现的问题）：
 *   desktopCapturer 截的是**整块屏**，而桌宠窗口就浮在上面一直在动。直接对整帧算哈希，
 *   每一帧都会因为宠物动画而变化——于是"屏幕变过 = 人在"这条证据永远成立，
 *   人真的离开时也不会待机。
 *
 * 做法：把每个宠物窗口的矩形换算成缩略图坐标，从整块画面里不断裁掉与它相交的部分，
 * 每次保留面积更大的那一侧（左/右/上/下），得到一块**不含宠物**的观测区。
 * 宠物通常只占屏幕一角，裁完仍有大片画面可用。
 *
 * 纯函数、无 Electron 依赖：main.js 调它，单测直接 require 它。
 * 坐标系统一为缩略图像素（由调用方换算好）。
 */

'use strict';

/**
 * @param {{width:number,height:number}} size 缩略图尺寸
 * @param {Array<{x:number,y:number,width:number,height:number}>} blockers 要抠掉的矩形（同一坐标系）
 * @returns {{x:number,y:number,width:number,height:number}} 观测区（至少保留原图的 1/16）
 */
function largestRectOutside(size, blockers) {
  const width = Math.max(0, Math.floor(size.width));
  const height = Math.max(0, Math.floor(size.height));
  let rect = { x: 0, y: 0, width, height };
  if (rect.width <= 0 || rect.height <= 0) return rect;

  for (const raw of blockers || []) {
    const b = {
      x: Number(raw && raw.x) || 0,
      y: Number(raw && raw.y) || 0,
      width: Number(raw && raw.width) || 0,
      height: Number(raw && raw.height) || 0,
    };
    if (b.width <= 0 || b.height <= 0) continue;
    const ix0 = Math.max(rect.x, b.x);
    const iy0 = Math.max(rect.y, b.y);
    const ix1 = Math.min(rect.x + rect.width, b.x + b.width);
    const iy1 = Math.min(rect.y + rect.height, b.y + b.height);
    if (ix1 <= ix0 || iy1 <= iy0) continue; // 不相交

    const candidates = [
      { x: rect.x, y: rect.y, width: ix0 - rect.x, height: rect.height }, // 左
      { x: ix1, y: rect.y, width: rect.x + rect.width - ix1, height: rect.height }, // 右
      { x: rect.x, y: rect.y, width: rect.width, height: iy0 - rect.y }, // 上
      { x: rect.x, y: iy1, width: rect.width, height: rect.y + rect.height - iy1 }, // 下
    ].filter((r) => r.width > 0 && r.height > 0);

    if (candidates.length === 0) return rect; // 被完全盖住：保留原样（调用方仍会算哈希）
    rect = candidates.reduce((best, cur) => (cur.width * cur.height > best.width * best.height ? cur : best));
  }

  // 兜底：裁得太小（< 原来的 1/16）就退回整帧——小到没有统计意义，不如承认它不准
  if (rect.width * rect.height < (width * height) / 16) {
    return { x: 0, y: 0, width, height };
  }
  return rect;
}

module.exports = { largestRectOutside };
