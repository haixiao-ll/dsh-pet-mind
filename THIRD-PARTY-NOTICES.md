# 第三方组件与素材声明（THIRD-PARTY NOTICES）

> 代码是 MIT，**素材不是**。这份文件逐项列出"哪些东西不是本仓库原创"，以及公开分发前的建议。
> 完整合规说明见 [docs/LEGAL.md](docs/LEGAL.md)。

## 1. 运行时依赖（npm）

| 包 | 版本 | 许可 | 用途 |
|---|---|---|---|
| `openai` | 7.39.0 | Apache-2.0 | 可选的服务商客户端（对话/建议走 DSH 的 llm 抽象） |
| `@anthropic-ai/sdk` | 0.135.0 | MIT | 同上 |
| `zod` | 4.6.7 | MIT | 数据结构校验 |
| `@electron/get` | ^5.1.0 | MIT | 桌面模式按需下载 Electron |
| `@electron-internal/extract-zip` | ^1.0.5 | MIT | 解压 Electron 包 |

开发依赖（`tsdown` / `rolldown` / `typescript` / `eslint` / `prettier` / `react` 等）均为
MIT 或 Apache-2.0，不随插件发布。

DSH 的 `@deepseek-ai/*` 是 **peerDependencies**（由宿主提供，本包不打包、不转发）。

## 2. 系统组件（不随包分发）

| 组件 | 用途 | 说明 |
|---|---|---|
| Windows.Media.Ocr | 本地 OCR | 操作系统自带，随 Windows 语言包安装；本仓库只调用，不打包、不下载 |
| Windows PowerShell 5.1 | 运行 OCR / 前台窗口采集脚本 | 系统自带 |
| Electron | 桌面透明窗运行时 | 由 `@electron/get` 在用户机器上按需下载，不随 npm 包分发 |

## 3. 视觉/音频素材（**重点**）

来自上游仓库，本仓库没有重新制作：

| 路径 | 数量 | 来源 | 状态 / 建议 |
|---|---|---|---|
| `assets/webm/*.webm` | 106 个透明动画 | 上游 AI 生成（豆包 → 绿幕 → 透明流水线） | 随上游以 MIT 分发；上游未单独出具素材授权书，商用前自行确认 |
| `assets/memes/*.png` | 27 张表情包 | 上游收集，多为网络梗图 | **权利状态不明**：梗图常含第三方著作权/肖像权，MIT 覆盖不到。公开分发前建议删除或替换 |
| `assets/fonts/上首软糖体.ttf` | 1 个字体 | 第三方字体厂商 | **需单独核实**：免费商用/需署名/需购买三种情况都存在。不确定就删除，界面回退系统字体 |
| `assets/pic/*.png` | 光标/通知图标 | 上游制作 | 随上游 MIT |
| `assets/logo.png` | 插件图标 | 上游制作 | 随上游 MIT |

### 删除素材不会坏

- **表情包**：`readMemePool` 只收录磁盘上真实存在的图片；删掉 `assets/memes/*.png` 后，
  配置里对应条目自动失效（气泡退化为纯文字）；
- **字体**：删掉 `.ttf` 后找不到字体会回退系统字体（界面不崩，只是不好看）。

### 最稳的发布做法

1. 用一个只保留代码/动画、删除 `assets/memes` 与 `assets/fonts` 的提交发布；
2. 或者把这两类素材换成你自己有权的版本，并在本文件登记来源与授权。

## 4. 模型服务（用户自选，不随包分发）

建议文案会调用**你配置的模型服务商**（DSH 的 `chatModel` / 当前对话模型，或 `mode:"model"` 时你填的
OpenAI 兼容端点）。请求内容为 **OCR 文字 + 前台应用名**（`mode:"ocr"`），不包含图像。
其数据处理、计费、内容政策由该服务商负责，请阅读其条款。

## 5. 参考但未打包的项目

- [`dsh-vision-router`](https://github.com/ysr666/dsh-vision-router)：提供了"把画面转成文本再交给纯文本模型"
  的思路；本仓库**没有**把它作为依赖，也没有复制其代码。
- 上游 `PC2005-cloud/dsh-pet`、增强 fork `TuWeiZhi/dsh-pet`：见 [NOTICE.md](NOTICE.md)。

## 6. 免责

本项目按 MIT "AS IS" 提供，不对素材权利、数据丢失、建议正确性或因使用产生的任何后果作担保。
详见 [docs/LEGAL.md](docs/LEGAL.md) 与 [LICENSE](LICENSE)。
