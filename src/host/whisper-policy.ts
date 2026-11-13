/**
 * 碎碎念**是否开跑 / 多久跑一次**——0.5 起完全由本地配置决定。
 *
 * 改造前后对比（为什么删掉 DSH 策略入参）：
 * - 旧版碎碎念真的要发模型请求，所以调度前必须问 DSH 的 standalone-AI 策略：
 *   `isReady()`（服务商配好了吗）、`canWhisper()`（允许后台自动调模型吗）、
 *   `whisperIntervalSec()`（宿主规定的周期）。
 * - 碎碎念改成**纯本地语句池**后这三道闸门失去意义，反而有害：没配 AI 的用户会连
 *   本地碎碎念都收不到（明明零成本、零网络）。
 *
 * 现在只认两件事：宠物自己的 `whisperEnabled` + 配置里的周期（下限 60s 防抖，
 * 非法/缺省回落 300s）。0 或负数视作"没配"，不留忙等入口。
 */
export function automaticWhisperSchedule(
  petEnabled: boolean,
  configuredPeriodSec: number,
): { enabled: boolean; periodSec: number } {
  const n = Number(configuredPeriodSec);
  return {
    enabled: petEnabled,
    periodSec: Number.isFinite(n) && n > 0 ? Math.max(60, n) : 300,
  };
}
