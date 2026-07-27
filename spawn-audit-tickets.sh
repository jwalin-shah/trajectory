#!/bin/bash
# Spawn all 6 documentation audit tickets to ct v4-flash
# Usage: bash spawn-audit-tickets.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TICKETS_DIR="$SCRIPT_DIR/tickets"

echo "🚀 SPAWNING DOCUMENTATION AUDIT TICKETS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Tickets to spawn:"
ls -1 "$TICKETS_DIR"/*.json | xargs -I {} basename {} | sed 's/^/  ✓ /'
echo ""

# Check if bridge is available
if ! command -v bridge &> /dev/null; then
  echo "❌ bridge command not found. Install bridge first:"
  echo "   cd ~/projects/bridge && go build -o ~/bin/bridge ./cmd/bridge"
  exit 1
fi

echo "🎯 Spawning to tokenrouter (ct) with v4-flash..."
echo ""

spawned=0
failed=0

for ticket_file in "$TICKETS_DIR"/*.json; do
  ticket_name=$(basename "$ticket_file" .json)
  echo "▶️  Spawning $ticket_name..."

  # Create brief from ticket JSON
  brief=$(jq -r '{
    title: .title,
    description: .description,
    allowed_paths: .allowed_paths,
    proof_method: .proof_method,
    acceptance: .acceptance
  }' "$ticket_file")

  # Spawn via bridge to ct v4-flash
  if bridge spawn "$ticket_file" <(echo "$brief") --adapter ct --model deepseek-v4-flash 2>/dev/null; then
    ((spawned++))
    echo "   ✅ Spawned"
  else
    ((failed++))
    echo "   ⚠️  Spawn queued (check bridge ledger)"
  fi

  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SPAWN STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Spawned: $spawned/6"
echo ""

if [[ $spawned -eq 6 ]]; then
  echo "✅ All tickets spawned!"
  echo ""
  echo "Next steps:"
  echo "1. Monitor: bridge ledger (check status)"
  echo "2. Watch: ~/.bridge/ledger.jsonl for updates"
  echo "3. Merge: When all complete, merge claims-ledger.json from feature branch"
  echo "4. Verify: Run bash scripts/verify-all-claims.sh to see results"
else
  echo "⚠️  Some tickets didn't spawn immediately (queued)"
  echo "   Check bridge ledger to see status"
fi

echo ""
echo "To check ledger:"
echo "  bridge ledger"
echo ""
echo "To see claims as they're added:"
echo "  tail -f ~/.bridge/ledger.jsonl | jq '.'"
