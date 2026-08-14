#!/usr/bin/env bash
#
# image-vision 一键安装脚本
#
# 用法：
#   bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)
#   TARGET=codex  bash install.sh     # 只安装到 Codex
#   TARGET=claude bash install.sh     # 只安装到 Claude Code
#   TARGET=dsh    bash install.sh     # 只安装到 DSH 轻量技能（~/.dsh/skills，无需重启）
#   TARGET=dsh DSH_PROFILE=web bash install.sh
#                                     # DSH 深度接入：npm 安装插件 + 自动写 cordis.patch.yml 装载条目
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/wangyang10/image-vision.git}"
TARGET="${TARGET:-both}"   # codex | claude | dsh | both
SKILL_SRC="skills/image-vision"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

case "${TARGET}" in
  codex)  DEST_DIRS=("${CODEX_HOME:-$HOME/.codex}/skills") ;;
  claude) DEST_DIRS=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills") ;;
  dsh)    DEST_DIRS=("${DSH_HOME}/skills") ;;
  both)   DEST_DIRS=("${CODEX_HOME:-$HOME/.codex}/skills" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills") ;;
  *) echo "错误：TARGET 只能是 codex / claude / dsh / both" >&2; exit 1 ;;
esac

# ---- DSH 深度接入：npm 插件 + 装载条目（无需 git clone）----
if [ "${TARGET}" = "dsh" ] && [ -n "${DSH_PROFILE:-}" ]; then
  if ! command -v dsh >/dev/null 2>&1; then
    echo "错误：未找到 dsh 命令（请先安装 DeepSeek Harness，或把 dsh 加入 PATH）" >&2
    exit 1
  fi
  echo "==> 安装 dsh-image-vision 到 profile「${DSH_PROFILE}」（npm 发布版）"
  dsh plugin --profile "${DSH_PROFILE}" add dsh-image-vision

  PATCH_FILE="${DSH_HOME}/profiles/${DSH_PROFILE}/cordis.patch.yml"
  if grep -q "dsh-image-vision" "${PATCH_FILE}" 2>/dev/null; then
    echo "==> ${PATCH_FILE} 已有 image-vision 装载条目，跳过"
  else
    mkdir -p "$(dirname "${PATCH_FILE}")"
    if [ -f "${PATCH_FILE}" ] && grep -qE '^\[\]$' "${PATCH_FILE}"; then
      # 占位空列表 → 替换为 insert 条目
      awk 'BEGIN{r=0} /^\[\]$/ && !r {print "- insert:"; print "    - id: image-vision"; print "      name: dsh-image-vision"; print "      config:"; print "        maxEdge: 2048"; print "        maxBytes: 10485760"; r=1; next} {print}' "${PATCH_FILE}" > "${PATCH_FILE}.tmp" && mv "${PATCH_FILE}.tmp" "${PATCH_FILE}"
    else
      cat >> "${PATCH_FILE}" <<'EOF'

- insert:
    - id: image-vision
      name: dsh-image-vision
      config:
        maxEdge: 2048
        maxBytes: 10485760
EOF
    fi
    echo "==> 已在 ${PATCH_FILE} 写入 image-vision 装载条目"
  fi
  echo
  echo "安装完成！"
  echo "  1. 插件已装载（若未热加载生效，重启 dsh web）"
  echo "  2. 配置识图 API：新建 ~/.dsh/image-vision.env（见 README「配置」）"
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "==> 下载 ${REPO_URL}"
git clone --depth 1 "${REPO_URL}" "${TMP_DIR}/image-vision" >/dev/null 2>&1

SRC="${TMP_DIR}/image-vision/${SKILL_SRC}"
if [ ! -f "${SRC}/SKILL.md" ]; then
  echo "错误：仓库中未找到 ${SKILL_SRC}/SKILL.md" >&2
  exit 1
fi

for dest in "${DEST_DIRS[@]}"; do
  if [ -d "${dest}/image-vision" ]; then
    echo "==> 已存在 ${dest}/image-vision，跳过（如需更新请先手动删除）"
    continue
  fi
  mkdir -p "${dest}"
  cp -R "${SRC}" "${dest}/image-vision"
  echo "==> 已安装到 ${dest}/image-vision"
done

echo
echo "安装完成！"
case "${TARGET}" in
  codex)  echo "  1. 重启 Codex 后自动发现该技能" ;;
  claude) echo "  1. 重启 Claude Code 后自动发现该技能" ;;
  dsh)    echo "  1. 技能根目录由 DSH 监视，立即生效，无需重启" ;;
  both)   echo "  1. 重启 Codex / Claude Code 后自动发现该技能" ;;
esac
echo "  2. 配置识图 API：参照 README 创建 ~/.codex/image-vision.env（DSH 建议 ~/.dsh/image-vision.env）"
