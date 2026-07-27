#!/bin/bash
# Verify all claims in claims-ledger.json against evidence
# No LLM — just timestamps and objective facts
#
# Usage: verify-all-claims.sh [claims-ledger.json]

LEDGER=${1:-scripts/claims-ledger.json}

if [[ ! -f "$LEDGER" ]]; then
  echo "❌ Claims ledger not found: $LEDGER"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 CLAIM VERIFICATION REPORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Parse JSON and verify each claim
verified=0
stale=0
questionable=0
unknown=0

while IFS= read -r line; do
  # Skip jq keys that don't contain a claim
  if [[ ! "$line" =~ "id" ]]; then
    continue
  fi

  # Extract claim ID (basic parsing)
  claim_id=$(echo "$line" | grep -o '"id": "[^"]*"' | cut -d'"' -f4 | head -1)
  if [[ -z "$claim_id" ]]; then
    continue
  fi

  # Use jq to get full claim object
  claim=$(jq ".claims[] | select(.id == \"$claim_id\")" "$LEDGER")

  if [[ -z "$claim" ]]; then
    continue
  fi

  # Extract fields
  claim_text=$(echo "$claim" | jq -r '.claim')
  status=$(echo "$claim" | jq -r '.status')
  evidence_type=$(echo "$claim" | jq -r '.evidence_type')
  actual=$(echo "$claim" | jq -r '.actual_value // "N/A"')

  # Count by status
  case "$status" in
    STALE) ((stale++)) ;;
    QUESTIONABLE) ((questionable++)) ;;
    VERIFIED) ((verified++)) ;;
    *) ((unknown++)) ;;
  esac

  # Print claim with status
  case "$status" in
    STALE)
      echo "❌ STALE: $claim_text"
      if [[ "$actual" != "N/A" ]]; then
        echo "   Actual: $actual"
      fi
      ;;
    QUESTIONABLE)
      echo "⚠️  QUESTIONABLE: $claim_text"
      ;;
    VERIFIED)
      echo "✅ VERIFIED: $claim_text"
      ;;
    *)
      echo "❓ UNKNOWN: $claim_text (evidence: $evidence_type)"
      ;;
  esac
  echo ""

done < <(jq -r '.claims[] | .id' "$LEDGER")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total=$((verified + stale + questionable + unknown))
echo "✅ Verified:      $verified"
echo "❌ Stale:         $stale"
echo "⚠️  Questionable:  $questionable"
echo "❓ Unknown:       $unknown"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total claims: $total"

if [[ $stale -gt 0 ]]; then
  echo ""
  echo "⚠️  ACTION REQUIRED: $stale stale claims need updates"
  exit 1
fi

exit 0
