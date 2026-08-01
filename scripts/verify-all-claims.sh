#!/bin/bash
# Verify all claims in claims-ledger.json against evidence by executing proof commands.
# Wrapper around scripts/verify-all-claims.mjs (the real executor).
#
# Usage:
#   verify-all-claims.sh [claims-ledger.json] [--write] [--json]
#
# Exit codes:
#   0 — no STALE claims
#   1 — STALE claims present, or executor failure / empty ledger

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LEDGER=""
EXTRA=()
for arg in "$@"; do
  case "$arg" in
    --write|--json) EXTRA+=("$arg") ;;
    *)
      if [[ -z "$LEDGER" && "$arg" != -* ]]; then
        LEDGER="$arg"
      else
        EXTRA+=("$arg")
      fi
      ;;
  esac
done

LEDGER="${LEDGER:-scripts/claims-ledger.json}"

if [[ ! -f "$LEDGER" ]]; then
  echo "❌ Claims ledger not found: $LEDGER" >&2
  exit 1
fi

# Prefer node; bun also works for the mjs executor
if command -v node >/dev/null 2>&1; then
  RUNNER=(node)
elif command -v bun >/dev/null 2>&1; then
  RUNNER=(bun)
else
  echo "❌ Need node or bun to run verify-all-claims.mjs" >&2
  exit 1
fi

exec "${RUNNER[@]}" "$ROOT/scripts/verify-all-claims.mjs" "$LEDGER" "${EXTRA[@]+"${EXTRA[@]}"}"
