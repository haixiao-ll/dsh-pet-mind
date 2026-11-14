# 实测记录（0.5.0）

> 目的：把"能跑"变成"可复现的证据"。本页记录一次真实环境的功能验证，命令与结果都可照着做。
> 验证范围仅限当时的机器与模型，不代表所有环境；未覆盖项在文末列出。

## 环境

| 项 | 值 |
|---|---|
| 日期 | 2026-11-15 |
| 系统 | Windows 11，双屏 2560×1390，缩放 100% |
| 宿主 | DeepSeek Harness 桌面版（Electron），Web 端口以实际为准 |
| 插件 | `dsh-pet-mind` 0.5.0（本地 tgz 安装） |
| 模型 | `deepseek-account / deepseek-flash`，上下文窗口 1,048,576 |
| 宠物 | `display: desktop`，size 462，右上角 |

## 结果总表

| # | 功能 | 验证方式 | 结果 |
|---|---|---|---|
| 1 | 上下文用量 | `GET /dsh-pet-7340/mind/context` | ✅ `197,918 / 1,048,576 = 18.9%`（同一会话早前为 `723,880 = 69.0%`） |
| 2 | 窗口兜底 | 重启后检查 `contextWindow` | ✅ 重启后仍能拿到 `1048576`（`resolveModel`/配置兜底） |
| 3 | 冷启动快照 | 检查 `dsh-pet/mind-state.json` | ✅ 文件存在，含 `usedTokens/contextWindow/percent/sessionId`，无屏幕内容 |
| 4 | 工作记忆 | `POST /mind/summarize` | ✅ 生成 `memory/work/2026-11-15_0056_session-4113….md`，索引变为「工作记忆（1）」 |
| 5 | 陪伴记忆 | 检查 `memory/companion/notes-2026-11.md` | ✅ 已有条目（称呼类），索引「陪伴记忆（1）」 |
| 6 | 专注建议（OCR→模型） | 查看 `/mind/state` 的 `suggestion` | ✅ 模型基于屏幕文字给出具体建议（如「先检查 NOTICE.md 和 README.md…」），非通用寒暄 |
| 7 | 本地 OCR | `vision.lastFrameAt` 与日志 | ✅ 曾识别 675 字；帧时间戳持续更新 |
| 8 | 隐私闸门 | 当前前台应用检查 | ✅ `DeepSeek Harness → capture:true`；敏感应用/提权窗口由单测覆盖 |
| 8b | 隐私暂停 | `POST /mind/pause?paused=1/0` | ✅ 暂停后 `capture:false, reason:"paused"`；恢复后 `capture:true, reason:"ok"` |
| 9 | 待机 | 空闲时 `/mind/state` | ✅ 空闲达阈值时 `standby:true`；输入后恢复 |
| 10 | 环显示 | 安装后代码路径 + 指针事件 | ⚠️ 无法在无人值守下模拟透明窗悬停；已确认安装包含 `mousemove` 命中兜底与"数据变化亮 10 秒"，视觉效果待人工确认 |
| 11 | 环的位置 | 几何计算 | ✅ `left = size×0.6875+4`、`top = 28%`：在身体右缘外侧、气泡带（0–23%）以下 |
| 12 | 记忆注入 | 单测 + 系统提示词段 | ✅ `dsh-pet:shared-memory` 段注入 `INDEX.md`（长度上限 1600 字符） |

## 关键命令

```sh
# 上下文（把端口换成你的 DSH 端口）
curl http://127.0.0.1:<port>/dsh-pet-7340/mind/context

# 记忆索引
curl http://127.0.0.1:<port>/dsh-pet-7340/mind/memory

# 手动落一份工作记忆（需要插件已看到若干轮对话）
curl -X POST http://127.0.0.1:<port>/dsh-pet-7340/mind/summarize

# 状态汇总（上下文/感知/记忆/建议）
curl http://127.0.0.1:<port>/dsh-pet-7340/mind/state
```

## 观察到的质量问题（已知，待改）

- **本地摘要的关键词混入系统文本**：`INDEX.md` 里出现 `current, this, time, asia, shanghai, zone`
  这类来自"当前时间/时区"注入行的词，说明本地抽取的关键词过滤不够干净（不影响功能，但索引不美观）；
- **摘要标题取自用户消息**：用首条消息做标题，长消息会被截断，可读性一般；
- **OCR 对深色主题/小字号仍可能读空**：读空时不会硬凑建议，但也就没有建议。

## 未覆盖

- macOS / Linux 的桌面感知（仅 Windows 实现，其他平台应降级为无感知）；
- Safari/WKWebView 的 `.mov` 动画路径；
- 除 `deepseek-flash` 外的模型（`openai` 兼容端点、其他服务商）；
- 多显示器切换、远程桌面、HDR/高 DPI 边界；
- 长时间（>24h）运行的内存与文件增长；
- 桌面透明窗的真实悬停视觉（需要人工在桌面上悬停确认）。

## 复现建议

1. 按 [INSTALL-LOCAL](INSTALL-LOCAL.md) 安装并**完全重启** DSH；
2. 与模型聊 1–2 轮，确认 `/mind/context` 出现 `percent`；
3. 打开一个正常网页停留 30 秒，确认 `/mind/state.suggestion` 有内容；
4. 说一句「以后叫我 XX」，确认 `memory/companion/` 出现条目；
5. 执行一次 `/mind/summarize`，确认 `memory/work/` 出现文件、`/mind/memory` 索引更新；
6. 把鼠标停在宠物身上，确认环出现、移开后淡出。
