# 心智层（mind）—— 上下文计量 / 双轨记忆 / 桌面感知

> 0.5 新增。目标是让桌宠从"会动的贴纸"变成"知道你忙到哪、记得你们做过什么、该安静时会安静"的伴。
> 这一层**默认开启**，但所有能力都可以在 `assets/config.jsonc` 的 `mind` 段关掉；
> 关掉总开关后，桌宠行为与 0.4.x 完全一致。

---

## 1. 一眼看全：数据流

```
DSH session/event ──▶ ContextMeter ──▶ 百分比 ──▶ 阈值(80%/95%) ──▶ 宠物说一句
        │                                   │
        │                                   └──▶ 自动落一份工作记忆（memory/work/*.md）
        └──▶ 对话缓冲（每会话最近 160 行）──▶ 本地抽取摘要

Windows 前台窗口/空闲 ──▶ Privacy 闸门 ──▶ Coach（停留/冷却/免打扰）──▶ 建议气泡
                              │
                              └──▶ 人不在（空闲≥5min）──▶ 待机（不采集、不建议）

memory/INDEX.md ──▶ ctx.systemPrompt.section ──▶ 新会话 / 子支线自动"读到"记忆
```

四个部件都可以单独失败：传感器起不来，计量与记忆照常；模型不可用，本地摘要照常。

---

## 2. 上下文计量（ContextMeter）

**数据源**（全部来自 DSH 宿主事件，不读盘、不发请求）：

| 事件 | 用到的字段 | 用途 |
|---|---|---|
| `session/event` → `assistant/message` | `usage: TokenUsage` | 已用 token（输入+缓存读写+输出） |
| `session/event` → `request/context` | `contextWindow` / `provider` / `model` | 算出百分比 |

**口径**：`已用 = inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens`；
都没有时退回 `totalTokens`；窗口未知时**不显示百分比**（不拿 0 冒充"空闲"）。

**不算子代理**：`origin=subagent` 或 `delegationDepth>0` 的会话不计入——否则并行子任务一多，
主子对话的百分比会虚高，用户看到的是错的进度。

**阈值提醒**：默认 `[0.8, 0.95]`；同一会话同一档只提醒一次，跨档才再提醒（`ThresholdLatch`）。
提醒只是"说一句"，不阻塞、不弹窗、不改 DSH 的对话。

**在哪看**：

- **宠物头顶的进度环**（浏览器 overlay 与桌面透明窗**两端都有**；随宠物移动，悬停显示 `已用 63%（80k / 128k tokens）`）：
  绿 `<80%`、琥珀 `80–95%`、红 `≥95%`，与提醒档位同一套阈值；待机时环变暗。
  浏览器每 10 秒从 `/mind/state` 拉一次（上下文是慢变量）；桌面端读 `sections.mind` 叶子（与其它状态同一条桥）。
- `GET /dsh-pet-7340/mind/context`（或 `/mind/state`）。

> 环只在**拿到百分比**时出现：窗口未知（宿主没上报 `contextWindow`）时宁可不显示，
> 也不拿 0 假装"完全空闲"。

---

## 3. 双轨记忆（Memory）

### 3.1 为什么分两轨

| | 工作记忆 | 陪伴记忆 |
|---|---|---|
| 记什么 | 我们在做什么：进展/决策/待办 | 我们是什么关系：称呼/偏好/约定 |
| 来源 | DSH 会话的 user/assistant 文本 | 宠物对话里"值得记"的句子 |
| 触发 | 到阈值自动 / 手动 `/mind/summarize` | 每句话启发式判定（`worthRemembering`） |
| 位置 | `memory/work/YYYY-MM-DD_HHmm_<会话>.md` | `memory/companion/notes-YYYY-MM.md` |

混在一起会互相污染：技术名词让宠物说话变味，"叫我老板"对写代码没有帮助。

### 3.2 摘要怎么来的（默认零 token）

`summarizeLocally()` 是**抽取式**，默认不调用模型：

- 标题 = 第一句用户输入；
- 进展 = 最近 6 条用户发言（人自己说的话最能代表意图）；
- 决策/待办 = 按关键词捞（决定/采用/改成；TODO/下一步/还没）；
- 关键词 = ASCII 词频（中文分词不可靠，硬切只会产生噪音）；
- 原始线索 = 最近 6 条对话（截断）。

> 想要更通顺的摘要，可以开 `mind.memory.polishWithModel: true`：把最近 40 行对话交给
> 当前对话模型整理成严格 JSON（标题/一句话/进展/决策/待办/关键词），失败**自动退回本地版**。
> 但**默认关闭**：临近上限时再塞长 prompt，等于把省下来的上下文又吃回去。

### 3.3 「新会话 / 子支线快速学习」

`memory/INDEX.md` 会被注入 DSH 的系统提示词（`ctx.systemPrompt.section`，order 950）：

```
【你与主人共同的记忆（由桌宠 dsh-pet 维护，仅供理解上下文，不要主动复述）】
# 记忆索引
## 工作记忆（3）
- [上下文用量设计](work/2026-11-13_1400_s-1.md) · context, meter
...
最近一次工作的一句话结论：……
```

- 注入上限 `maxInjectChars`（默认 1600 字符）——记忆是"需要时查"的索引，不是每轮背一遍；
- 需要细节时，模型可以按索引里的相对路径去读 `memory/work/*.md`（DSH 的文件工具能读）；
- 关掉 `memory.injectSystemPrompt` 就不注入，文件仍然照常写。

### 3.4 存储保证

- **原子写**：先写 `.tmp` 再 `rename`，断电不会留下半截文件；
- **只写人说过的话**：窗口标题、截图、密钥一律不进记忆；
- **纯 markdown**：可以用编辑器改、可以进 git、可以整个目录备份；
- 摘要在写盘后清空该会话缓冲区，避免同一段对话被重复记。

---

## 4. 桌面感知与建议（Sensors + Coach）

### 4.1 采集什么（**只直播，不录屏**）

常驻 PowerShell（`scripts/mind/foreground-watch.ps1`）每 5 秒输出一行 JSON：

```json
{"ts":1731460000000,"idleMs":1200,"app":"Code","title":"main.ts - dsh-pet"}
```

- `idleMs`：`GetLastInputInfo`（键盘+鼠标最近一次输入至今）；
- `app` / `title`：`GetForegroundWindow` + `GetWindowTextW` + 进程名。

**没有截图、没有录屏、没有写文件。** 标题只在内存里做隐私判定，用完即弃，不进日志、不进记忆。

### 4.2 隐私闸门（`privacy.ts`）

三道保险，任何一道命中就停采：

1. **内置名单**：微信/QQ/钉钉/飞书、支付宝/银联/PayPal、主流网银/券商客户端、
   1Password/Bitwarden/KeePass 等密码管理器、mstsc/TeamViewer/ToDesk/向日葵 等远程桌面；
2. **标题兜底**：标题出现"密码/支付/转账/银行/验证码/私钥/助记词/登录"等字样（中英双语）；
3. **默认拒绝**：识别不出前台应用（提权窗口、全屏独占、采集器没起来）→ 当敏感处理。

用户可以在 `mind.privacy.apps` / `titlePatterns` 里加；`paused=true` 或设置页「隐私暂停」
立刻停采。

### 4.3 建议规则（`coach.ts`）

- **一次停留只建议一次**：进入一个页面/应用后满 `dwellSec`（默认 30 秒）触发，
  之后这个页面不再打扰；"新的一次停留" = 应用或**窗口标题**变化（切标签、切文件都算）；
- 失败（OCR 读不出字 / 模型报错 / 模型回 SKIP）会在 30 秒后**重试一次**，
  同一次停留最多 2 次尝试；成功后这一页永久封口；
- 全局每天最多 `dailyLimit`（默认 6）条，本地零点重置；**只计真正弹出的建议**——
  OCR 读不出字、模型报错、模型回 SKIP 都不占额度（同一次停留也不会因此重试，避免空转）；
- 旧的 `dwellMinutes` / `cooldownMinutes` 仍兼容，但冷却概念已被"一次停留一次"取代；
- 空闲 ≥ `idleMinutes`（默认 5）→ 视为"人不在"：**不发任何消息**，宠物转**待机**——
  随机动作链停掷骰、只播 idle 呼吸（看起来是安静地待着，不是定住），碎碎念也一起静音；
  采集继续，但不再产生建议。用户回来（有输入）后自动恢复；
- 夜间免打扰 `quietHours`（默认 23:00–08:00）。

建议文案按应用类型粗分（编辑器/浏览器/聊天/通用），每次从 3 句里随机一条。

### 4.4 云端单帧（默认关闭）

`privacy.cloudAllowlist` 留空 = **任何画面都不出本机**。
当前版本的本地建议只依赖"停留时长 + 应用类型 + 时间"，**不需要像素**。
如果以后要接视觉模型：只有白名单里的应用、且用户显式点了"看一眼"，
才把**一帧压缩图**发给模型，发完即弃，不落盘、不进记忆。

### 4.5 截帧（默认关闭，只存在于内存）

`mind.vision.enabled=true` 后，桌面 Helper 每 `intervalMs`（默认 30s）做一次：

1. 主进程 `desktopCapturer.getSources` 拿一张 **640×360 缩略图**（只在内存）；
2. **先把桌宠自己的窗口从画面里裁掉**（`capture-region.js`：按窗口矩形取面积最大的那一侧）。
   不裁的话宠物动画会让每一帧哈希都变，"人在"的证据就永远成立——实跑踩到过；
3. 对剩下的 BGRA 位图每 64 字节采样，算 FNV-1a 哈希；
4. 图像对象立刻被垃圾回收，**只把 `{hash, width, height}` 回给宿主**。

宿主只保存哈希与时间，**从不保存像素**；用途只有一个：判断"屏幕最近变过 = 人在"。
这样远程桌面/虚拟输入环境下 `GetLastInputInfo` 不重置时，也不会把正在看视频的人误判成待机。

隐私约束（与其余感知一致）：

- 默认关闭；开之前宿主也会先过 `privacy.ts`（敏感应用 / 暂停 / 识别不出 → 不请求）；
- 帧不落盘、不进 DSH 的附件库（`ImageAttachmentRef` 会持久化，所以**刻意不走模型图片通道**）；
- 请求带一次性 id + 10s TTL，迟到的帧直接丢弃。

### 4.6 画面 → 文本 → 建议（默认 `mode: "ocr"`）

到点后不是把图直接丢给模型，而是先在本地转成文字：

```
Helper 截帧（OCR 模式用 1600×900，缩到 640×360 文字会糊）→ base64 经 bridge 回宿主
  → PowerShell stdin → Windows.Media.Ocr（系统自带 OCR，本地、不联网、不下模型）
  → 识别出的文字 + 前台应用名 → 当前文本模型（或 suggestion.model 指定的轻量模型）
  → 一句建议 → 气泡
```

配置：

```jsonc
"mind": {
  "coach": { "dwellSec": 30, "dailyLimit": 6 },
  "suggestion": { "model": { "provider": "", "model": "" }, "maxChars": 120 },
  "vision": { "enabled": true, "mode": "ocr" }
}
```

要点：

- **画面不出本机**：OCR 是系统组件，图片只经过内存；出网的只有"识别出的文字 + 应用名"，
  而且是交给**你自己选的文本模型**（和普通对话同一套凭证）；
- 不需要多模态模型：DeepSeek-Chat 这类纯文本模型就能用；
- `suggestion.model` 留空 = **与「对话」用的模型完全一致**（chatModel；chatModel 也留空时跟随当前选择）；
  填一个小模型可以降低费用，但内容质量也会跟着变；
- OCR 读不出字（视频/游戏/纯图）→ **不打扰**，不拿通用文案凑数；
- 模型回 `SKIP`（文字里出现密码/支付/私聊）→ 不弹；
- 提示词末尾硬性约束：**只做出建议，不做任何实际操作**（不调用工具、不改文件、不执行命令）；
  这个模型调用本身也没有挂任何工具，双重保险；
- 旧的 `mode: "model"`（直接把帧发给云端视觉端点）仍保留，但默认关、需要显式配置端点与密钥。

### 4.7 诚实的限制

- **密码框无法从外部可靠识别**：只能靠应用名单 + 窗口标题 + 手动暂停，这是"三道保险"而不是绝对；
- **提权窗口读不到标题**（UIPI）：所以默认拒绝；
- **Pagefile**：内存里的帧可能被操作系统换页到磁盘，任何用户态程序都避免不了，除非系统级 DRM；
- **跨平台**：采集器目前只支持 Windows；其它平台自动降级（不采集、不建议），桌宠本体照常。

---

## 5. HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-pet-7340/mind/state` | 聚合视图：上下文 / 活跃度 / 记忆统计 / 最近建议（**不含标题**） |
| GET | `/dsh-pet-7340/mind/context` | 只要上下文快照 |
| GET | `/dsh-pet-7340/mind/memory` | 只读记忆索引原文 |
| POST | `/dsh-pet-7340/mind/summarize[?session=]` | 手动落一份工作记忆 |
| POST | `/dsh-pet-7340/mind/pause?paused=1` | 暂停/恢复采集（内存态，重启复位） |

---

## 6. 配置速查（`mind` 段）

```jsonc
"mind": {
  "enabled": true,
  "context": { "thresholds": [0.8, 0.95], "notify": true },
  "memory":  { "autoSummary": true, "injectSystemPrompt": true, "maxInjectChars": 1600,
               "polishWithModel": false },
  "coach":   { "enabled": true, "dwellSec": 30, "idleMinutes": 5,
               "dailyLimit": 6, "quietHours": [23, 8] },
  "suggestion": { "model": { "provider": "", "model": "" }, "maxChars": 120 },
  "privacy": { "paused": false, "apps": [], "titlePatterns": [],
               "cloudAllowlist": [], "unknownIsSensitive": true },
  "sensor":  { "enabled": true, "intervalMs": 5000 },
  "vision":  { "enabled": false, "mode": "ocr", "intervalMs": 30000, "changeWindowMs": 120000,
               "analyze": { "enabled": false, "endpoint": "", "model": "",
                            "apiKeyEnv": "OPENAI_API_KEY", "allApps": false } },
}
```

全部可省略；写错类型按默认跑（不报错、不中断桌宠）。

---

## 7. 以后可以怎么长

已经留好的扩展点：

- **新传感器**：`src/host/mind/sensors/` 加一个模块，返回 `start/stop`，在 `index.ts` 装配；
- **新建议策略**：`coach.ts` 里加规则（注意冷却/每日上限/免打扰要一起考虑）；
- **模型润色摘要**：`summarize()` 里替换 summary 对象，配置加开关；
- **视觉**：`privacy.cloudAllowlist` + 一次显式点击 + 单帧，接口在 `sensors/` 里预留；
- **客户端展示**：`/mind/state` 已经是给 UI 用的聚合视图，加卡片只动 `src/client/settings.ts`。
