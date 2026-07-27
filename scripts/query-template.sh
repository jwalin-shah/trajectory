#!/bin/bash
# Parameterized Neo4j query runner
# Usage: query-template.sh <query-name> [params...]
# Example: query-template.sh sessions-by-adapter CT
# Example: query-template.sh messages-in-range 2026-07-24 2026-07-25

QUERY_NAME=${1:-help}
NEO4J_USER=${NEO4J_USER:-neo4j}
NEO4J_PASS=${NEO4J_PASS:-axiom-knowledge}
NEO4J_URL=${NEO4J_URL:-http://localhost:7474/db/neo4j/tx/commit}

auth_header=$(echo -n "$NEO4J_USER:$NEO4J_PASS" | base64)

# Helper to run query
run_query() {
  local cypher=$1
  curl -s -u "$NEO4J_USER:$NEO4J_PASS" "$NEO4J_URL" \
    -H "Content-Type: application/json" \
    -d "{\"statements\":[{\"statement\":\"$cypher\"}]}" | jq '.results[0].data[].row'
}

case $QUERY_NAME in
  sessions-by-adapter)
    adapter=${2:-CT}
    run_query "MATCH (s:TranscriptSession) WHERE s.adapter='$adapter' RETURN count(s) as count, avg(s.messageCount) as avgMsgs, max(s.recordCount) as maxRecords"
    ;;

  sessions-last-hours)
    hours=${2:-24}
    run_query "MATCH (s:TranscriptSession) WHERE s.timestamp > datetime() - duration('PT${hours}H') RETURN count(s) as sessions, sum(s.recordCount) as totalRecords"
    ;;

  conversations-by-adapter)
    adapter=${2:-CT}
    run_query "MATCH (s:TranscriptSession) WHERE s.adapter='$adapter' AND s.messageCount > 0 RETURN s.id, s.messageCount, s.toolCount ORDER BY s.messageCount DESC LIMIT 20"
    ;;

  tool-usage)
    run_query "MATCH (s:TranscriptSession) WHERE s.toolCount > 0 RETURN s.adapter, count(s) as withTools, sum(s.toolCount) as totalTools, avg(s.toolCount) as avgTools"
    ;;

  session-detail)
    session_id=${2:?require session ID}
    run_query "MATCH (s:TranscriptSession) WHERE s.id='$session_id' RETURN s.adapter, s.timestamp, s.messageCount, s.toolCount, s.recordCount"
    ;;

  longest-sessions)
    limit=${2:-10}
    run_query "MATCH (s:TranscriptSession) RETURN s.adapter, s.id, s.messageCount, s.recordCount ORDER BY s.messageCount DESC LIMIT $limit"
    ;;

  help|*)
    cat << 'EOF'
Neo4j Query Templates

Usage: query-template.sh <query-name> [params...]

Available queries:
  sessions-by-adapter [adapter]       Count sessions by adapter (default: CT)
  sessions-last-hours [hours]         Sessions in last N hours (default: 24)
  conversations-by-adapter [adapter]  Top conversations by message count
  tool-usage                          Summary of tool calls by adapter
  session-detail <id>                 Details for one session
  longest-sessions [limit]            Top N sessions by message count (default: 10)

Examples:
  query-template.sh sessions-by-adapter CT
  query-template.sh sessions-last-hours 26
  query-template.sh longest-sessions 5
  query-template.sh session-detail abc123def456
EOF
    ;;
esac
