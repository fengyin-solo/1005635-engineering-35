#!/usr/bin/env bash
# 回收入口：仅本地环境复位用。换一份复位令牌清单，刷新/重开页面后各模块整体回到种子。
# 生产/CI 环境会被直接拒绝；重复执行是安全的（页面侧复位记录按签名去重，只记一次）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

node "$FRONTEND_DIR/scripts/reset-local.mjs" "${1:-本地复位}"
