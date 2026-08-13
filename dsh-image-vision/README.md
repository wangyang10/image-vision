# dsh-image-vision

[![npm version](https://img.shields.io/npm/v/dsh-image-vision)](https://www.npmjs.com/package/dsh-image-vision)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DeepSeek Harness (DSH) 插件版 image-vision：让没有视觉能力的模型（如 DeepSeek 纯文本模型）也能"看图"。
调用任意 OpenAI 兼容识图 API（OpenRouter、SiliconFlow、智谱、Kimi、通义千问、本地 Ollama 等），
完成图片描述、问答、OCR 等任务。

这是 [image-vision](https://github.com/wangyang10/image-vision) 仓库的 DSH 接入层，与上游
Codex/Claude Code 技能共用同一套 API 与配置语义。

## 功能

- 注册模型工具 **`vision_query`**：模型直接以结构化参数调用，无需拼写命令行；
  schema 自动进入 system prompt，UI 自动渲染调用卡片，支持取消与超时。
- 注册运行时技能 **`image-vision`**：技能目录与 GUI `/image-vision` 斜杠菜单继续可用。
- 配置走 DSH 体系：环境变量 / DSH 凭据（`~/.dsh/.credentials.yaml`）/ dotfile
  （`~/.dsh/image-vision.env` → `~/.codex/image-vision.env`）/ 内置默认值。
- 自动预处理（macOS `sips`）：HEIC/AVIF → JPEG、TIFF/BMP → PNG、长边超限缩放、超限压缩；
  `sips` 不可用时原图直传。
- 多图对比、OCR、`json` 结构化输出。

## 安装（当前 profile）

本地装载（开发用，无需 npm 发布）：

```bash
# 1. 让 profile 的 node_modules 能看到插件（符号链接即可，插件零运行时依赖）
mkdir -p ~/.dsh/profiles/web/node_modules
ln -s <本目录> ~/.dsh/profiles/web/node_modules/dsh-image-vision

# 2. 在 ~/.dsh/profiles/web/cordis.patch.yml 追加：
# - insert:
#     - id: image-vision
#       name: dsh-image-vision
#       config:
#         maxEdge: 2048
#         maxBytes: 10485760
```

配置文件热加载，装载后无需重启（loader 监听 patch 层）。

## 发布安装（任意 profile）

已发布到 npm：[`dsh-image-vision`](https://www.npmjs.com/package/dsh-image-vision)（`npm i dsh-image-vision`）。

```bash
# 安装到目标 profile（web 示例）：
dsh plugin --profile web add dsh-image-vision    # 转发给 pnpm 安装依赖
# 并把 "dsh-image-vision" 加入该 profile package.json 的 dsh.profile.bundles：
#   "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-image-vision"] } }
```

## 配置优先级（每次调用实时读取）

1. 工具参数 `model` / `base_url`（仅本次调用）
2. 环境变量 `VISION_API_KEY` / `VISION_API_BASE` / `VISION_MODEL`（key 回退 `OPENAI_API_KEY`）
3. DSH 凭据服务（`ctx.credentials`，如 `~/.dsh/.credentials.yaml`）
4. `~/.dsh/image-vision.env`（回退 `~/.codex/image-vision.env`）
5. 默认：OpenRouter + `qwen/qwen3-vl-32b-instruct`

```bash
VISION_API_KEY=你的识图平台密钥
VISION_API_BASE=https://openrouter.ai/api/v1
VISION_MODEL=qwen/qwen3-vl-32b-instruct
```

> ⚠️ 配置文件含密钥，权限 600，勿提交到仓库。DeepSeek 官方 API 不支持图片输入。

## 插件配置项（cordis.patch.yml / bundles 的 config）

| 字段 | 默认 | 含义 |
|---|---|---|
| `maxEdge` | `2048` | 长边超过则缩到此值（`0` 禁用缩放） |
| `maxBytes` | `10485760` | 超过 10MB 则重压缩 |

## 开发者说明

- 零运行时依赖（仅 Node 内置模块），因此从任意位置（符号链接/拷贝）都能被 loader 装载。
- 上游脚本 `skills/image-vision/scripts/vision_query.py` 仍是回退路径，保留在仓库中。
- `assets/SKILL.md` 是 DSH 版技能正文（工具优先），与上游 `skills/image-vision/SKILL.md` 保持同步。
