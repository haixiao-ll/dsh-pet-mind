// 移动几何与角落定位：纯计算（无 DOM / ref），可独立单测。
// 坐标语义：移动规划归一化为视口比例（ratio），px 换算由调用方（rAF 驱动 / customPos）完成；
// 角落定位返回宠物根节点左上角的像素坐标（浏览器 overlay 用 CSS 同语义，桌面模式用它摆放 sprite）。
import { randomBetween } from './pickers';
import { rectAtPoint } from './displays';
import type { Corner, Rect } from './types';

/** 一次移动的几何参数（比例坐标） */
export interface MovePlan {
  startRatio: number;
  startYRatio: number;
  targetRatio: number;
  totalRatio: number;
}

/** 计算一次移动的起点/终点比例坐标；目标越出视口边缘（含边距）时返回 null。
 *  sideAllow = 左右透明边余量（视频画布内宠物身体居中、两侧透明）：边界按"身体"贴边而不是
 *  按"整个视频盒"贴边——宠物能走到屏幕边缘，但身体永不越界（不会漫游到屏幕外丢失）。
 *
 *  areas 传入时（桌面多显示器）边界改判**工作区并集**而不是视口外接矩形：落点的身体两侧
 *  各留 margin 后仍须落在某块屏上。缝隙两侧都有屏 ⇒ 可自由走过去（允许骑缝）；外接矩形里的
 *  空洞没有屏 ⇒ 走不进去。不传时按 W/H 单矩形判定，浏览器 overlay 行为逐位不变。 */
export const planMove = (o: {
  cx: number;
  cy: number;
  W: number;
  H: number;
  dir: 1 | -1;
  minDist: number;
  maxDist: number;
  margin: number;
  halfW: number;
  /** 可选：身体相对视频盒左/右各留多少像素（默认 0 = 旧行为，按视频盒贴边） */
  sideAllow?: number;
  /** 可选：显示器工作区列表（与 cx/cy 同坐标系）。给了就按并集判定落点可达性 */
  areas?: Rect[];
}): MovePlan | null => {
  const side = o.sideAllow ?? 0;
  const distance = randomBetween(o.minDist, o.maxDist);
  const target = o.cx + o.dir * distance;
  if (o.areas && o.areas.length > 0) {
    // 身体左右缘各外扩 margin 后都得落在某块屏上（可以分属不同屏 = 允许骑缝行走）
    const bodyHalf = o.halfW - side;
    if (!rectAtPoint(o.areas, target - bodyHalf - o.margin, o.cy)) return null;
    if (!rectAtPoint(o.areas, target + bodyHalf + o.margin, o.cy)) return null;
  } else {
    // margin 语义 =「身体到屏幕边缘的安全距」：盒中心可到 margin + halfW - side（身体左缘 = margin）
    const leftBound = o.margin + o.halfW - side;
    const rightBound = o.W - o.margin - o.halfW + side;
    if (target < leftBound || target > rightBound) return null;
  }
  return {
    startRatio: o.cx / o.W,
    startYRatio: o.cy / o.H,
    targetRatio: target / o.W,
    totalRatio: Math.abs(target - o.cx) / o.W,
  };
};

/**
 * 角落 + 边距 → 宠物根节点左上角像素坐标。
 * 与浏览器 overlay 的 CSS 角落语义一致：
 *   top-left     = left:marginX, top:marginY
 *   top-right    = right:marginX, top:marginY
 *   bottom-left  = left:marginX, bottom:marginY
 *   bottom-right = right:marginX, bottom:marginY
 * 桌面模式用同一套几何摆放宠物（根节点 = 舞台）。
 *
 * area 传入时角落取**那块屏**而不是视口外接矩形。多显示器不规则布局下外接矩形的角落可能
 * 压根不属于任何显示器（实测右倒 T 型双屏：top-left 落在主屏上方的空洞里，配了该角落的宠物
 * 开机即隐身），所以桌面端必须传主屏工作区。不传时按 W/H，浏览器 overlay 行为不变。
 *
 * sideAllow（可选）：画布左右两侧的**透明留白**（角色只占画布中间约 240/640）。贴角语义是
 * 「角色**身体**贴边」，不是画布贴边——不扣掉留白，marginX=0 时角色本体也离屏幕边缘差半个身位。
 * 缺省 0 → 行为与改造前逐字一致（浏览器 overlay 由 CSS 的 --dsh-pet-sl/-sr 做同一件事）。
 */
export const anchorPixel = (o: {
  corner: Corner;
  marginX: number;
  marginY: number;
  size: number;
  W: number;
  H: number;
  /** 可选：角落所属的工作区矩形（与调用方同坐标系）；缺省用 {0,0,W,H} */
  area?: Rect;
  /** 可选：左右透明留白（px）。只影响左右两个角落，上下不受影响 */
  sideAllow?: number;
}): { x: number; y: number } => {
  const height = (o.size * 9) / 16;
  const a = o.area ?? { x: 0, y: 0, width: o.W, height: o.H };
  // 缺省 0 → 与改造前完全一致；桌面端调用方传真实留白，边距只算角色本体
  const side = o.sideAllow ?? 0;
  const left = a.x + o.marginX - side;
  const top = a.y + o.marginY;
  const right = a.x + a.width - o.size - o.marginX + side;
  const bottom = a.y + a.height - height - o.marginY;
  switch (o.corner) {
    case 'top-left':
      return { x: left, y: top };
    case 'top-right':
      return { x: right, y: top };
    case 'bottom-left':
      return { x: left, y: bottom };
    case 'bottom-right':
      return { x: right, y: bottom };
  }
};
