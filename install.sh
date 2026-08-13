#!/usr/bin/env bash
#
# image-vision 一键安装脚本
#
# 用法：
#   bash <(curl -fsSL https://raw.githubusercontent.com/wangyang10/image-vision/main/install.sh)
#   TARGET=codex  bash install.sh    # 只安装到 Codex
#   TARGET=claude bash install.sh    # 只安装到 Claude Code
#   TARGET=dsh    bash install.sh    # 只安装到 DeepSeek Harness（轻量：~/.dsh/skills）
#
# DSH 深度接入（vision_query 工具）需额外装载 dsh-image-vision 插件：
#   TARGET=dsh DSH_PROFILE=web bash install.sh   # 顺便把插件符号链接进该 profile
#   （cordis.patch.yml 的 insert 条目仍需手动追加，见 README「DeepSeek Harness 接入」）
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/wangyang10/image-vision.git}"
TARGET="${TARGET:-both}"   # codex | claude | dsh | both
SKILL_SRC="skills/image-vision"
PLUGIN_SRC="dsh-image-vision"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

case "${TARGET}" in
  codex)  DEST_DIRS=("${CODEX_HOME:-$HOME/.codex}/skills") ;;
  claude) DEST_DIRS=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills") ;;
  dsh)    DEST_DIRS=("${DSH_HOME}/skills") ;;
  both)   DEST_DIRS=("${CODEX_HOME:-$HOME/.codex}/skills" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills") ;;
  *) echo "错误：TARGET 只能是 codex / claude / dsh / both" >&2; exit 1 ;;
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

# DSH 深度接入：可选地把插件符号链接进指定 profile 的 node_modules
if [ "${TARGET}" = "dsh" ] && [ -n "${DSH_PROFILE:-}" ]; then
  PLUGIN_SRC_DIR="${TMP_DIR}/image-vision/${PLUGIN_SRC}"
  PLUGIN_DEST="${DSH_HOME}/profiles/${DSH_PROFILE}/node_modules"
  if [ -f "${PLUGIN_SRC_DIR}/package.json" ]; then
    if [ -e "${PLUGIN_DEST}/dsh-image-vision" ]; then
      echo "==> 已存在 ${PLUGIN_DEST}/dsh-image-vision，跳过"
    else
      mkdir -p "${PLUGIN_DEST}"
      ln -s "${PLUGIN_SRC_DIR}" "${PLUGIN_DEST}/dsh-image-vision"
      echo "==> 插件已链接到 ${PLUGIN_DEST}/dsh-image-vision"
    fi
    echo "==> 别忘了在 ${DSH_HOME}/profiles/${DSH_PROFILE}/cordis.patch.yml 追加 insert 条目（见 README）"
  else
    echo "错误：仓库中未找到 ${PLUGIN_SRC}/package.json" >&2
    exit 1
  fi
fi

echo
echo "安装完成！"
case "${TARGET}" in
  codex)  echo "  1. 重启 Codex 后自动发现该技能" ;;
  claude) echo "  1. 重启 Claude Code 后自动发现该技能" ;;
  dsh)    echo "  1. 技能根目录由 DSH 监视，立即生效，无需重启" ;;
  both)   echo "  1. 重启 Codex / Claude Code 后自动发现该技能" ;;
esac
echo "  2. 配置识图 API：参照 README 创建 ~/.codex/image-vision.env（DSH 建议 ~/.dsh/image-vision.env）"
