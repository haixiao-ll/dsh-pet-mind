# 本地安装到 DSH（不经过 npm）

> 适用：机器上已经装着旧的 `@tuweizhi/dsh-pet`（它和本插件**用同一个 entry id `dsh-pet`**，
> 不能并存，必须先卸旧的）。装完后桌宠状态、`main-config.jsonc`、`memory.json` 都在原位置，不会丢。

---

## 0. 准备

- 包：`E:\idea-workspase\dsh-pet-main\dsh-pet-mind-0.5.0.tgz`（`npm pack` 产物）
- 桌面应用自带 CLI（你这台机器的路径）：
  `D:\Users\admin\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`
- 建议先备份：`%USERPROFILE%\.dsh\dsh-pet\`（配置 + 记忆）
- 能力边界：[LIMITATIONS](LIMITATIONS.md)；数据流与合规：[PRIVACY](PRIVACY.md)、[LEGAL](LEGAL.md)

---

## 1. 卸载旧插件（必须）

```bat
"D:\Users\admin\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop remove @tuweizhi/dsh-pet
```

## 2. 安装本包

```bat
"D:\Users\admin\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "E:\idea-workspase\dsh-pet-main\dsh-pet-mind-0.5.0.tgz"
```

装完检查 `C:\Users\admin\.dsh\profiles\desktop\package.json`：

```jsonc
"dependencies": { "dsh-pet-mind": "file:../../../idea-workspase/dsh-pet-main/dsh-pet-mind-0.5.0.tgz" },
"dsh": { "profile": { "bundles": [ ..., "dsh-pet-mind" ] } }
```

> 正常情况下 `plugin add` 会把它写进 `bundles`；**如果没写**，手动在 `bundles` 末尾加一行 `"dsh-pet-mind"`，
> 否则插件不会进配置树（桌宠不出现、也没有任何报错，这是最容易漏的一步）。

## 3. 心智层（默认已开，不用配）

**不需要编辑 `main-config.jsonc`。** 出厂默认已开启：本地 OCR 建议、30 秒/每页一次、每天 6 条、
失败重试一次、23:00–08:00 免打扰、文案上限 120 字、窗口自动识别。

想关掉或调节奏时，才需要动 `assets/config.jsonc` 里带注释的字段（或者设置页的开关/隐私暂停）。

## 4. 重启桌面应用（**必须完全退出**）

> 热装（应用还开着就 `plugin add`）可能报 `require(...) is not a function` 或"入口未激活"。
> 正确做法：托盘退出 → 任务管理器确认没有 `DeepSeek Harness.exe` → 再启动。

重启后看 DSH 控制台（或 `%APPDATA%\DeepSeek Harness\logs` 里最新的日志）：

```
[dsh-pet] 桌面感知：截帧链路已通（1600×900，只回哈希，不落盘）
[dsh-pet] OCR 识别到 675 字
[dsh-pet] 建议已发送：ocr
```

气泡出现在桌宠头顶，文案来自模型。**同一个页面只出现一次**；切到别的页面/软件 30 秒后再给一次。

---

## 5. 验证清单

| 现象 | 说明 |
|---|---|
| 30 秒内没有任何反应 | 正常：进入新页面后要停满 30 秒 |
| 一直没有任何反应 | 见下面排查表 |
| 同一个页面给两次 | 看日志里窗口标题是否在变（标题变=新页面） |
| 一天超过 6 条 | 只有真正弹出的才计数；检查是否重启过进程（计数在内存里，重启清零） |

### 排查表

| 日志/现象 | 原因与处理 |
|---|---|
| 没有 `截帧链路已通` | `vision.enabled` 被手动关了 / 插件没进 bundles / Helper 没起来 |
| `OCR 未产出文字：no-engine` | 系统缺 OCR 语言包（设置 → 时间和语言 → 语言 → 中文 → 可选功能） |
| `OCR 未产出文字：empty` | 画面太小/太糊/纯图无字（视频、游戏） |
| `OCR 未产出文字：timeout` | PowerShell 被杀或系统卡；重试一次仍失败就跳过该页 |
| `建议模型未返回可用文案` | 模型调用失败：检查 DSH 的「对话」模型是否可用；或模型回了 SKIP |
| `视觉建议：应用不在 cloudAllowlist` | 只可能出现在 `mode:"model"`（云端视觉），OCR 模式不会 |
| 敏感应用（微信/支付宝/网银…）不触发 | 设计如此：隐私闸门先拦，不会截帧 |

### 关于头顶/右肩的环

- **刚装完第一次启动没有环**：计量只吃实时事件，先聊一轮（拿到 usage）才会出现；
- 从第二次启动起，会先显示**上一轮快照（灰度）**，并标注「上次记录，等待本轮数据」；
- 环平时自动亮 10 秒后淡出，**鼠标悬停宠物**会保持显示；移开淡出；
- 一直不出现：先看 `GET /mind/context` 是否有 `percent`；没有就看宿主是否上报 `usage`/`contextWindow`，
  或手动在 `mind.context.windowTokens` 填模型窗口。

---

## 6. 回滚

```bat
"...\dsh.cmd" plugin --profile desktop remove dsh-pet-mind
"...\dsh.cmd" plugin --profile desktop add @tuweizhi/dsh-pet@0.4.4
```

配置与记忆在 `%USERPROFILE%\.dsh\dsh-pet\`，两个版本共用，回滚不用搬家。

---

## 7. 隐私边界（一句话）

**画面不出本机**：截帧→OCR 全在内存/系统组件里完成；出网的只有"识别出的文字 + 前台应用名"，
交给**你自己配置的对话模型**。`mind.vision.mode` 保持 `"ocr"` 就不会有任何图片离开这台机器。
