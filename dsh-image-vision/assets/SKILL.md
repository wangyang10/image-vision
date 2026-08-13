---
name: image-vision
description: 调用外部识图模型 API（OpenAI 兼容接口）读取、描述、分析图片或从图片中提取文字（OCR）。当当前使用的模型不具备视觉能力（例如 DeepSeek 等纯文本模型），而任务需要识别图片内容（截图、照片、图表、扫描件、UI 界面、流程图）时使用。由 dsh-image-vision 插件提供。
---

# Image Vision：调用识图 API 读取图片（DeepSeek Harness 版）

当前模型“看不见”图片时，用本技能把图片发送给外部视觉模型 API，取回识别结果并转述给用户。
本技能由 `dsh-image-vision` 插件提供，与上游 Codex/Claude Code 版本保持同一套 API 和配置语义。

## 使用流程（首选：vision_query 工具）

本插件已注册结构化工具 `vision_query`，直接调用它即可，无需拼写命令行：

```text
vision_query(images: [本地路径或 URL], prompt: "用户的问题", ...)
```

- 图片来自对话附件 → 附件对应的本地路径；也可传 http(s) URL 或 data URL。
- 用户已明确提问 → 直接用用户的问题作为 `prompt`。
- 用户只给了图片、没有提问 → 省略 `prompt`，工具使用默认提示词（描述图片内容）。
- 多张图片一起分析 → `images` 传多个路径。
- 提取图中全部文字（OCR）→ `prompt: "完整提取截图中的文字，保留换行和代码格式"`。
- 需要结构化输出 → `json: true`，模型会只返回 JSON。
- 按需覆盖模型/接口 → `model`、`base_url` 参数（对应下方配置）。

工具内部自动完成预处理（见下）并把结果整理后返回；调用失败（网络、鉴权、模型不支持视觉）时
错误信息会说明原因，请如实转述，并提示检查 `VISION_API_KEY` / `VISION_API_BASE` / `VISION_MODEL`。

## 回退：Python 脚本

若 `vision_query` 工具不可用（例如插件未装载、模型工具列表受限），可运行上游脚本：

```bash
python3 <skill目录>/scripts/vision_query.py <图片路径或URL> --prompt "用户的问题"
```

技能目录通常是 `~/.dsh/skills/image-vision/`（Codex 安装为 `~/.codex/skills/image-vision/`）。

## 配置

按以下优先级读取（每次调用实时读取，修改后直接生效，无需重开会话）：

1. 工具参数 `model` / `base_url`（仅本次调用）
2. 环境变量 `VISION_API_KEY` / `VISION_API_BASE` / `VISION_MODEL`
   （`VISION_API_KEY` 未设置时回退到 `OPENAI_API_KEY`）
3. DSH 凭据服务（如 `~/.dsh/.credentials.yaml`，可在设置页管理）
4. 本机配置文件 `~/.dsh/image-vision.env`，不存在时回退 `~/.codex/image-vision.env`
   （`KEY=值` 形式，每行一个；含密钥，权限 600，勿提交到仓库）
5. 内置默认值（OpenRouter + `qwen/qwen3-vl-32b-instruct`）

注意：

- DeepSeek 官方 API 不支持图片输入，必须使用其他支持视觉的平台。其他平台
  （OpenAI、SiliconFlow、智谱、Kimi、通义千问、本地 Ollama 等）配置示例见
  `references/providers.md`（上游技能目录内）。
- 不要把 API Key 写进技能文件或提交到代码仓库。

## 自动预处理（默认开启，macOS）

发送前用系统自带 `sips` 对本地图片自动处理（URL / data URL 直接透传）：

- **格式转换**：HEIC/HEIF/AVIF → JPEG（iPhone 照片常见）；TIFF/BMP → PNG
- **尺寸缩放**：长边超过 `maxEdge`（默认 2048px）时自动缩到 2048px
- **大小压缩**：超过 `maxBytes`（默认 10MB）时重压缩（无透明 PNG → JPEG 质量 85；JPEG 重压到质量 80）

`maxEdge` / `maxBytes` 可在插件配置中调整；`sips` 不可用时原图直传。
处理日志以 `notes` 字段随工具结果返回。
