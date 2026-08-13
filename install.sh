#!/usr/bin/env bash
#
# image-vision 一键安装脚本
#
# 用法：
#   bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)
#   TARGET=codex  bash install.sh    # 只安装到 Codex
#   TARGET=claude bash install.sh    # 只安装到 Claude Code
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/wangyang10/image-vision.git}"
TARGET="${TARGET:-both}"   # codex | claude | both
SKILL_SRC="skills/image-vision"

case "${TARGET}" in
  codex)  DEST_DIRS=("${CODEX_HOME:-$HOME/.codex}/skills") ;;
  claude) DEST_DIRS=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills") ;;
  both)   DEST_DIRS=("${CODEX_HOME:-$HOME/.codex}/skills" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills") ;;
  *) echo "错误：TARGET 只能是 codex / claude / both" >&2; exit 1 ;;
esac

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
echo "  1. 重启 Codex / Claude Code 后自动发现该技能"
echo "  2. 配置识图 API：参照 README 创建 ~/.codex/image-vision.env"
