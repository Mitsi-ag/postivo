#!/usr/bin/env bash
# Postivo load test. Server must already be running.
# Usage: PORT=3220 bash scripts/load.sh
set -u

PORT="${PORT:-3220}"
BASE="http://localhost:${PORT}"

curl -sf "$BASE/api/health" >/dev/null || { echo "LOAD FAIL: no server at $BASE"; exit 1; }

BASE_URL="$BASE" node "$(dirname "$0")/load.mjs"
