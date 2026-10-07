#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node is required" >&2
  exit 1
fi
NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  echo "node >=20 is required" >&2
  exit 1
fi

npm test
npm run privacy

CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || true)}"
if [[ -z "$CLAUDE_BIN" ]]; then
  SIBLING_CLAUDE="$(dirname "$NODE_BIN")/claude"
  if [[ -x "$SIBLING_CLAUDE" ]]; then CLAUDE_BIN="$SIBLING_CLAUDE"; fi
fi

if [[ -n "$CLAUDE_BIN" ]]; then
  "$CLAUDE_BIN" plugin validate "$ROOT" --strict
else
  echo "claude plugin validate skipped: executable not available"
fi

echo "verify_jev_for_claude: passed"
