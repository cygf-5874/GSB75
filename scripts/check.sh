#!/usr/bin/env bash
# 固定验收入口：csvlite 的 12 个场景（basics 3 + dialect 3 + edge 3 + stream 2 + errors 1）。
# 用法：bash scripts/check.sh [-list] [--only <组名>]
set -uo pipefail

cd "$(dirname "$0")/.."

NODE="${NODE:-}"
if [ -z "$NODE" ]; then
  for candidate in node nodejs; do
    if command -v "$candidate" >/dev/null 2>&1; then
      NODE="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE" ]; then
  echo "找不到 Node.js 解释器（node / nodejs）" >&2
  exit 2
fi

exec "$NODE" check/check.mjs "$@"
