---
name: image-vision
description: 调用外部识图模型 API（OpenAI 兼容接口）读取、描述、分析图片或从图片中提取文字（OCR）。当 Codex 当前使用的模型不具备视觉能力（例如 DeepSeek 等纯文本模型），而任务需要识别图片内容（截图、照片、图表、扫描件、UI 界面、流程图）时使用。
---

# Image Vision：调用识图 API 读取图片

当前模型“看不见”图片时，用本技能把图片发送给外部视觉模型 API，取回识别结果并转述给用户。

## 使用流程

1. 拿到图片：通常是对话附件中的本地路径、URL 或 data URL。
2. 构造问题：
   - 用户已明确提问 → 直接用用户的问题作为 `--prompt`。
   - 用户只给了图片、没有提问 → 使用脚本默认提示词（描述图片内容）。
3. 运行脚本：

```bash
python3 scripts/vision_query.py <图片路径或URL> --prompt "用户的问题"
```

常用变体：

```bash
# 多张图片一起分析
python3 scripts/vision_query.py a.png b.png --prompt "这两张图有什么区别？"

# 提取图中全部文字（OCR）
python3 scripts/vision_query.py screenshot.png --prompt "完整提取截图中的文字，保留换行和代码格式"

# 需要结构化输出
python3 scripts/vision_query.py chart.png --prompt "输出：标题、图表类型、坐标轴含义、数据趋势" --json
```

4. 把模型返回的结果整理后直接回答用户；若调用失败（网络、鉴权、模型不支持视觉），如实说明错误信息，并提示检查 `VISION_API_KEY` / `VISION_API_BASE` / `VISION_MODEL` 配置。

## 配置

脚本按以下优先级读取配置：

1. 环境变量 `VISION_API_KEY` / `VISION_API_BASE` / `VISION_MODEL`
2. 本机配置文件 `~/.codex/image-vision.env`（`KEY=值` 形式，每行一个）
3. 脚本内置默认值（OpenRouter + `qwen/qwen3-vl-32b-instruct`）

本机当前配置在 `~/.codex/image-vision.env`：

```bash
VISION_API_KEY=<你的密钥>              # 已写入该文件，权限 600
VISION_API_BASE=https://openrouter.ai/api/v1
VISION_MODEL=qwen/qwen3-vl-32b-instruct
```

修改配置后直接生效，无需重开会话（每次调用都会重新读取该文件）。

注意：

- 环境变量优先于配置文件；`VISION_API_KEY` 未设置时回退到 `OPENAI_API_KEY`。
- DeepSeek 官方 API 不支持图片输入，必须使用其他支持视觉的平台。其他平台（OpenAI、SiliconFlow、智谱、Kimi、通义千问等）配置示例见 [references/providers.md](references/providers.md)。
- 不要把 API Key 写进技能文件或提交到代码仓库。
- 超大图片（如整屏截图）脚本会自动缩放/压缩，一般无需手动处理。

## 自动预处理（默认开启，macOS）

发送前脚本用系统自带 `sips` 对本地图片自动处理：

- **格式转换**：HEIC/HEIF/AVIF → JPEG（iPhone 照片常见）；TIFF/BMP → PNG
- **尺寸缩放**：长边超过 `--max-edge`（默认 2048px）时自动缩到 2048px
- **大小压缩**：超过 `--max-bytes`（默认 10MB）时重压缩（无透明 PNG → JPEG 质量 85；JPEG 重压到质量 80）

处理日志输出到 stderr（如 `note: resized 4032x3024 -> max edge 2048`），
便于确认实际发送的图片。URL / data URL 图片不做处理，直接透传。
不需要处理时加 `--no-preprocess` 关闭。

## 脚本参数速查

运行 `python3 scripts/vision_query.py --help` 可查看全部参数：
`--prompt/-p`、`--system`、`--json`、`--max-tokens`、`--temperature`、
`--model`、`--base-url`、`--verbose`、`--no-preprocess`、`--max-edge`、
`--max-bytes`。
