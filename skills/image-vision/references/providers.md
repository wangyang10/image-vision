# 视觉 API 平台配置示例

`scripts/vision_query.py` 只要求一个兼容 OpenAI 的 `/v1/chat/completions`
接口，并支持 `image_url` 内容类型。以下为常见平台示例，模型名称会随平台
更新，请以各平台官方文档为准。

## OpenRouter（当前配置）

```bash
export VISION_API_BASE="https://openrouter.ai/api/v1"
export VISION_API_KEY="sk-or-v1-..."
export VISION_MODEL="qwen/qwen3-vl-32b-instruct"
```

本机已把以上三项写入 `~/.codex/image-vision.env`，无需再手动 export。
OpenRouter 还提供 `qwen/qwen3-vl-235b-a22b-instruct`、`openai/gpt-4o-mini`
等视觉模型，可在其模型页面选择后修改 `VISION_MODEL`。

## OpenAI（默认）

```bash
export VISION_API_BASE="https://api.openai.com/v1"
export VISION_API_KEY="sk-..."
export VISION_MODEL="gpt-4o-mini"   # 也可用 gpt-4o、gpt-4.1-mini 等支持视觉的模型
```

## SiliconFlow（硅基流动，国内直连）

```bash
export VISION_API_BASE="https://api.siliconflow.cn/v1"
export VISION_API_KEY="sk-..."
export VISION_MODEL="Qwen/Qwen2.5-VL-72B-Instruct"
```

## Moonshot（Kimi）

```bash
export VISION_API_BASE="https://api.moonshot.cn/v1"
export VISION_API_KEY="sk-..."
export VISION_MODEL="moonshot-v1-8k-vision-preview"
```

## 智谱 AI（GLM）

```bash
export VISION_API_BASE="https://open.bigmodel.cn/api/paas/v4"
export VISION_API_KEY="..."
export VISION_MODEL="glm-4v-flash"   # flash 版本免费，也可用 glm-4v-plus
```

## 阿里云百炼（通义千问 Qwen-VL）

```bash
export VISION_API_BASE="https://dashscope.aliyuncs.com/compatible-mode/v1"
export VISION_API_KEY="sk-..."
export VISION_MODEL="qwen-vl-max"    # 也可用 qwen-vl-plus
```

## 本地 Ollama（无需 API Key）

```bash
export VISION_API_BASE="http://localhost:11434/v1"
export VISION_API_KEY="ollama"       # 任意非空字符串即可
export VISION_MODEL="llava"          # 或 minicpm-v、llama3.2-vision 等本地视觉模型
```

## 说明

- `VISION_API_KEY` 未设置时自动回退到 `OPENAI_API_KEY`。
- 修改环境变量后需重新打开 Codex 会话（或重新 source 配置文件）才会生效。
- DeepSeek 官方 API 不支持图片输入，不能作为视觉后端。
- 各平台对图片大小有上限（通常 10-20MB）。脚本默认会自动把长边缩到
  2048px、超过 10MB 重压缩，一般无需手动处理。
