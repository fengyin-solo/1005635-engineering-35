#!/usr/bin/env bash
# 起步：一条命令拉依赖并把种子数据灌好。
# 依赖缺失会先退回补录；中途断了重跑本脚本可续跑，反复执行不产生重复数据。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

if ! command -v node >/dev/null 2>&1; then
  echo "[setup] 未找到 node，请先安装 Node.js 20+ 后重跑" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[setup] 未找到 npm，请随 Node.js 一起安装后重跑" >&2
  exit 1
fi

node "$FRONTEND_DIR/scripts/setup.mjs"
