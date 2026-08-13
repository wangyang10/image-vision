# image-vision

让没有视觉能力的 Codex 模型（如 DeepSeek 等纯文本模型）也能"看图"：自动调用
OpenAI 兼容的识图模型 API（OpenRouter、SiliconFlow、智谱、Kimi、通义千问、
本地 Ollama 等），完成图片描述、问答、OCR 等任务。

A Codex skill that gives text-only models (e.g. DeepSeek) image-reading ability
by calling any OpenAI-compatible vision API.

## 特性

- 当前模型不具备视觉能力时，自动调用识图 API 读取图片
- 支持本地图片、http(s) URL、data URL；支持多图对比
- 自动预处理（macOS）：HEIC/HEIF/AVIF → JPEG、TIFF/BMP → PNG，
  长边超 2048px 自动缩放，超过 10MB 自动压缩（可用 `--no-preprocess` 关闭）
- OCR 提取文字、`--json` 结构化输出

## 安装

技能本体位于仓库的 `skills/image-vision/` 目录，是 Codex 和 Claude Code
都支持的标准 skills 目录结构。

### 方式一：让 Codex 自动安装（推荐）

把技能地址发给 Codex，说：

> 请安装这个技能：https://github.com/wangyang10/image-vision/tree/main/skills/image-vision

Codex 会自动下载并安装到 `~/.codex/skills/image-vision`，重启 Codex 后生效。

### 方式二：让 Claude Code 自动安装

把仓库地址发给 Claude Code，说：

> 从 https://github.com/wangyang10/image-vision 安装 image-vision 技能到
> `~/.claude/skills/` 目录

### 方式三：一键安装脚本

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)
```

默认同时安装到 Codex 和 Claude Code；只装其中一个：

```bash
TARGET=codex  bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)
TARGET=claude bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)
```

### 方式四：手动安装

```bash
git clone https://github.com/wangyang10/image-vision.git
cp -r image-vision/skills/image-vision ~/.codex/skills/    # Codex
cp -r image-vision/skills/image-vision ~/.claude/skills/   # Claude Code
```

安装后重启 Codex / Claude Code 即可自动发现该技能。

## 配置

新建 `~/.codex/image-vision.env`（脚本读取优先级：环境变量 > 该文件 > 内置默认）：

```bash
VISION_API_KEY=你的识图平台密钥
VISION_API_BASE=https://openrouter.ai/api/v1
VISION_MODEL=qwen/qwen3-vl-32b-instruct
```

其他平台（SiliconFlow / 智谱 / Kimi / 通义千问 / 本地 Ollama）示例见
[references/providers.md](skills/image-vision/references/providers.md)。

> ⚠️ `~/.codex/image-vision.env` 包含你的密钥，永远不要提交到任何仓库。

## 使用

在 Codex 中直接发送图片并提问即可自动触发；也可手动调用：

```bash
python3 ~/.codex/skills/image-vision/scripts/vision_query.py 图片.png --prompt "这张图里写了什么？"
python3 ~/.codex/skills/image-vision/scripts/vision_query.py a.png b.png --prompt "两张图有什么区别？"
python3 ~/.codex/skills/image-vision/scripts/vision_query.py 截图.png --prompt "完整提取图中文字" --json
```

## License

MIT
