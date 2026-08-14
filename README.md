# image-vision

让没有视觉能力的模型（如 DeepSeek 等纯文本模型）也能"看图"：自动调用
OpenAI 兼容的识图模型 API（OpenRouter、SiliconFlow、智谱、Kimi、通义千问、
本地 Ollama 等），完成图片描述、问答、OCR 等任务。

**一个仓库，多个 Agent 宿主**：同一套技能逻辑分别以标准 skill 和宿主插件的形式
提供给 Codex、Claude Code、DeepSeek Harness（DSH）等使用。

## 支持的 Agent

| Agent | 接入物 | 推荐安装方式 | 调用方式 | 运行时依赖 |
|---|---|---|---|---|
| **Codex** | 标准 skill（`skills/image-vision/`） | 自动安装 / 一键脚本 `TARGET=codex` | 发图提问自动触发；或手动跑 python 脚本 | python3 + sips（macOS） |
| **Claude Code** | 标准 skill | 自动安装 / 一键脚本 `TARGET=claude` | 同上 | python3 + sips（macOS） |
| **DeepSeek Harness (DSH)** | 插件（`dsh-image-vision/`，推荐） | 一键脚本 / 手动 / 把仓库地址发给 DSH 自动装 | 模型直接调 `vision_query` 工具；输入框 `/image-vision` | 无（纯 Node 内置模块） |
| **DeepSeek Harness (DSH)** | 标准 skill（轻量方案） | 一键脚本 `TARGET=dsh` | 发图提问触发技能，模型跑 python 脚本 | python3 + sips（macOS） |
| 其他支持 SKILL.md 的宿主 | 标准 skill | 复制到对应技能目录 | 依宿主而定 | python3 |

### 仓库结构

```
image-vision/
├── skills/image-vision/    # 标准 skill：Codex / Claude Code / 其他 SKILL.md 宿主 / DSH 轻量接入
│   ├── SKILL.md            #   技能说明（各宿主通用）
│   ├── scripts/vision_query.py
│   ├── agents/openai.yaml
│   └── references/providers.md
├── dsh-image-vision/       # DSH 插件：深度接入（Cordis 插件，独立可 publish）
│   ├── lib/*.js            #   vision_query 工具 + 运行时技能注册（零依赖 ESM）
│   ├── assets/SKILL.md     #   DSH 版技能正文（工具优先）
│   └── README.md
├── install.sh              # 一键安装脚本（TARGET=codex / claude / both / dsh；DSH 深度接入加 DSH_PROFILE=web）
└── README.md
```

DSH 深度接入与技能版共享同一套配置语义与预处理策略：`lib/` 是
`vision_query.py` 的 JS 移植，两边行为保持一致但互不依赖（插件不要求 python3）。

---

## 安装与使用

### 1. Codex

**安装**（任选其一）：

```bash
# 方式一：把技能地址发给 Codex，让它自动安装
#   "请安装这个技能：https://github.com/wangyang10/image-vision/tree/main/skills/image-vision"

# 方式二：一键脚本
TARGET=codex bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)

# 方式三：手动
git clone https://github.com/wangyang10/image-vision.git
cp -r image-vision/skills/image-vision ~/.codex/skills/
```

**配置**：新建 `~/.codex/image-vision.env`（见下方[配置](#配置)）。重启 Codex 后生效。

**使用**：在 Codex 中直接发送图片并提问即可自动触发；也可手动调用：

```bash
python3 ~/.codex/skills/image-vision/scripts/vision_query.py 图片.png --prompt "这张图里写了什么？"
python3 ~/.codex/skills/image-vision/scripts/vision_query.py a.png b.png --prompt "两张图有什么区别？"
python3 ~/.codex/skills/image-vision/scripts/vision_query.py 截图.png --prompt "完整提取图中文字" --json
```

### 2. Claude Code

**安装**：

```bash
# 方式一：把仓库地址发给 Claude Code
#   "从 https://github.com/wangyang10/image-vision 安装 image-vision 技能到 ~/.claude/skills/ 目录"

# 方式二：一键脚本
TARGET=claude bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)

# 方式三：手动
cp -r image-vision/skills/image-vision ~/.claude/skills/
```

**配置 / 使用**：与 Codex 相同（脚本固定读取 `~/.codex/image-vision.env`，两个宿主共用一份配置）。
重启 Claude Code 后生效。

### 3. DeepSeek Harness（DSH）

**安装**（任选其一；推荐深度接入，模型可直接调用 `vision_query` 工具）：

```bash
# 方式一：把仓库地址发给 DSH，让它自动安装
#   "安装这个插件：https://github.com/wangyang10/image-vision
#    （插件在 dsh-image-vision 子目录，已发布 npm，装到 web profile，装完验证可用）"

# 方式二：一键脚本（自动安装插件并写入装载条目）
TARGET=dsh DSH_PROFILE=web bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)

# 方式三：手动
dsh plugin --profile web add dsh-image-vision
# 然后在 ~/.dsh/profiles/web/cordis.patch.yml 追加：
# - insert:
#     - id: image-vision
#       name: dsh-image-vision
#       config:
#         maxEdge: 2048
#         maxBytes: 10485760
```

**使用**：直接发图提问（模型自动调 `vision_query`）；或在聊天输入框输入 `/image-vision` 唤起技能。
装载后一般热加载生效；未生效时重启 `dsh web`。配置与详细说明见
[`dsh-image-vision/README.md`](dsh-image-vision/README.md)。

**轻量接入**（不想装插件时）：只装技能目录，模型通过 python 脚本识图（需 python3）：

```bash
TARGET=dsh bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)
# 或手动：cp -r image-vision/skills/image-vision ~/.dsh/skills/
```

### 4. 其他支持 SKILL.md 的宿主

把 `skills/image-vision/` 复制到对应技能目录（如 `~/.claude/skills`、`~/.agents/skills` 等），
配置与使用同 Codex。

---

## 配置

所有宿主共用三个变量，读取优先级均为：**环境变量 > 配置文件 > 内置默认**。

新建配置文件（Codex / Claude Code 用 `~/.codex/image-vision.env`；DSH 建议
`~/.dsh/image-vision.env`，脚本与插件都会回退读取 `~/.codex/image-vision.env`）：

```bash
VISION_API_KEY=你的识图平台密钥
VISION_API_BASE=https://openrouter.ai/api/v1
VISION_MODEL=qwen/qwen3-vl-32b-instruct
```

- 环境变量名：`VISION_API_KEY`（未设置时回退 `OPENAI_API_KEY`）、`VISION_API_BASE`、`VISION_MODEL`
- DSH 插件额外支持把 key 存进 DSH 凭据体系（`~/.dsh/.credentials.yaml` / 设置页）
- 其他平台（SiliconFlow / 智谱 / Kimi / 通义千问 / 本地 Ollama）示例见
  [references/providers.md](skills/image-vision/references/providers.md)
- 修改配置后直接生效，无需重开会话（每次调用都会重新读取）

> ⚠️ 配置文件包含你的密钥（权限 600），永远不要提交到任何仓库。

## 特性

- 当前模型不具备视觉能力时，自动调用识图 API 读取图片
- 支持本地图片、http(s) URL、data URL；支持多图对比
- 自动预处理（macOS）：HEIC/HEIF/AVIF → JPEG、TIFF/BMP → PNG，
  长边超 2048px 自动缩放，超过 10MB 自动压缩（可用 `--no-preprocess` 关闭）
- OCR 提取文字、`--json` 结构化输出

## 维护说明

- `skills/image-vision/scripts/vision_query.py`（Python）与
  `dsh-image-vision/lib/`（JS 移植）是同一套逻辑的两份实现，改动预处理/API 行为时需同步两边。
- `assets/SKILL.md`（插件内嵌）与 `skills/image-vision/SKILL.md` 保持内容同步。

## License

MIT
