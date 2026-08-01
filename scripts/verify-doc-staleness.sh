#!/bin/bash
# Verify documentation staleness by comparing timestamps
# No LLM reasoning — just facts: when was doc last changed vs when did work happen
#
# Usage: verify-doc-staleness.sh <doc-file> <evidence-source>
# Example: verify-doc-staleness.sh ~/projects/bridge/AGENTS.md "git-log bridge/internal/spawn"
# Example: verify-doc-staleness.sh ~/projects/bridge/AGENTS.md "transcript-session abc123"

DOC_FILE=${1:?require doc file path}
EVIDENCE_SOURCE=${2:?require evidence source}

: "${NEO4J_PASSWORD:?NEO4J_PASSWORD is required; refusing an implicit credential}"
NEO4J_USER="${NEO4J_USER:-neo4j}"

neo4j_curl() {
  curl -s --config <(printf 'user = "%s:%s"\n' "$NEO4J_USER" "$NEO4J_PASSWORD") "$@"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 DOCUMENTATION STALENESS VERIFICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check doc exists
if [[ ! -f "$DOC_FILE" ]]; then
  echo "❌ Doc file not found: $DOC_FILE"
  exit 1
fi

# Get doc's last modification time (Unix timestamp)
doc_mtime=$(stat -f%m "$DOC_FILE" 2>/dev/null || stat -c%Y "$DOC_FILE" 2>/dev/null)
doc_date=$(date -r "$doc_mtime" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -d @"$doc_mtime" "+%Y-%m-%d %H:%M:%S")

echo "📝 Document: $(basename $DOC_FILE)"
echo "   Last updated: $doc_date"
echo "   Timestamp: $doc_mtime"
echo ""

# Parse evidence source
if [[ $EVIDENCE_SOURCE == git-log:* ]]; then
  # Git evidence: git-log:path/to/file
  path=${EVIDENCE_SOURCE#git-log:}
  echo "🔍 Evidence source: Git history for $path"

  # Get most recent commit that modified this path
  latest_commit=$(git log -1 --format=%ct -- "$path" 2>/dev/null)

  if [[ -z "$latest_commit" ]]; then
    echo "❌ No git history found for: $path"
    exit 1
  fi

  evidence_date=$(date -r "$latest_commit" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -d @"$latest_commit" "+%Y-%m-%d %H:%M:%S")
  echo "   Last code change: $evidence_date"
  echo "   Timestamp: $latest_commit"
  echo ""

  # Compare timestamps
  if (( doc_mtime < latest_commit )); then
    staleness_hours=$(( (latest_commit - doc_mtime) / 3600 ))
    echo "⚠️  STALE: Code changed $staleness_hours hours ago, docs not updated"
    echo ""
    echo "Age: Documentation is $staleness_hours hours behind the code"
    exit 1
  else
    freshness_hours=$(( (doc_mtime - latest_commit) / 3600 ))
    echo "✅ FRESH: Docs updated within last $freshness_hours hours of code change"
    exit 0
  fi

elif [[ $EVIDENCE_SOURCE == transcript-session:* ]]; then
  # Transcript evidence: transcript-session:session-id
  session_id=${EVIDENCE_SOURCE#transcript-session:}
  echo "🔍 Evidence source: Transcript session $session_id"

  # Query Neo4j for session timestamp
  neo4j_response=$(neo4j_curl http://localhost:7474/db/neo4j/tx/commit \
    -H "Content-Type: application/json" \
    -d "{\"statements\":[{\"statement\":\"MATCH (s:TranscriptSession) WHERE s.id CONTAINS '$session_id' RETURN s.timestamp LIMIT 1\"}]}" \
    2>/dev/null)

  evidence_timestamp=$(echo "$neo4j_response" | jq -r '.results[0].data[0].row[0]' 2>/dev/null)

  if [[ -z "$evidence_timestamp" ]] || [[ "$evidence_timestamp" == "null" ]]; then
    echo "❌ Session not found in Neo4j: $session_id"
    exit 1
  fi

  # Convert ISO timestamp to Unix time
  evidence_timestamp_unix=$(date -j -f "%Y-%m-%dT%H:%M:%S.000Z" "$evidence_timestamp" "+%s" 2>/dev/null || \
                           date -d "$evidence_timestamp" "+%s" 2>/dev/null)
  evidence_date=$(date -r "$evidence_timestamp_unix" "+%Y-%m-%d %H:%M:%S")

  echo "   Evidence timestamp: $evidence_date"
  echo "   Session ID: $session_id"
  echo ""

  # Compare timestamps
  if (( doc_mtime < evidence_timestamp_unix )); then
    staleness_hours=$(( (evidence_timestamp_unix - doc_mtime) / 3600 ))
    echo "⚠️  STALE: Work done $staleness_hours hours ago, docs not updated"
    exit 1
  else
    freshness_hours=$(( (doc_mtime - evidence_timestamp_unix) / 3600 ))
    echo "✅ FRESH: Docs updated within last $freshness_hours hours of work"
    exit 0
  fi

else
  echo "❌ Invalid evidence source format"
  echo "   Expected: git-log:path/to/file"
  echo "   Expected: transcript-session:session-id"
  exit 1
fi
