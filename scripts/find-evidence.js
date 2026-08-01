#!/usr/bin/env node
/**
 * Search transcripts for evidence of a claim/decision
 * Usage: find-evidence.js <search-pattern> [session-limit]
 *
 * Example: find-evidence.js "Luna subagent" 20
 * Example: find-evidence.js "deny-default" 50
 */

const NEO4J_URL = process.env.NEO4J_URL || "http://localhost:7474/db/neo4j/tx/commit";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASS = (process.env.NEO4J_PASSWORD || "").trim();
if (!NEO4J_PASS) {
  throw new Error("NEO4J_PASSWORD is required; refusing an implicit credential");
}

async function queryNeo4j(cypher) {
  const auth = Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString("base64");
  const response = await fetch(NEO4J_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify({
      statements: [{ statement: cypher }],
    }),
  });

  const data = await response.json();
  return data.results?.[0]?.data || [];
}

async function findEvidence(searchPattern, limit = 100) {
  console.log(`\n🔍 SEARCHING FOR EVIDENCE`);
  console.log(`Pattern: "${searchPattern}"`);
  console.log(`Limit: ${limit} sessions\n`);

  const cypher = `
    MATCH (s:TranscriptSession)
    RETURN s.id, s.adapter, s.messageCount, s.toolCount, s.records
    LIMIT ${limit}
  `;

  const results = await queryNeo4j(cypher);
  const pattern = searchPattern.toLowerCase();

  let found = [];

  for (const item of results) {
    const [sessionId, adapter, msgCount, toolCount, recordsJson] = item.row || item;
    const records = JSON.parse(recordsJson);

    // Count matches in this session
    let matchCount = 0;
    let matchingRecords = [];

    for (const record of records) {
      const content = JSON.stringify(record).toLowerCase();
      if (content.includes(pattern)) {
        matchCount++;
        matchingRecords.push(record);
      }
    }

    if (matchCount > 0) {
      found.push({
        sessionId: sessionId.slice(0, 12),
        adapter,
        messageCount: msgCount,
        toolCount: toolCount,
        matchCount,
        matchingRecords: matchingRecords.slice(0, 2),
      });
    }
  }

  console.log(`Searched: ${results.length} sessions`);
  console.log(`Found in: ${found.length} sessions\n`);

  if (found.length === 0) {
    console.log(`❌ No evidence found\n`);
    return;
  }

  console.log(`✅ EVIDENCE FOUND:\n`);

  for (const hit of found.slice(0, 10)) {
    console.log(`📝 ${hit.adapter} / ${hit.sessionId}`);
    console.log(`   Messages: ${hit.messageCount} | Tools: ${hit.toolCount}`);
    console.log(`   Matches: ${hit.matchCount} record(s)\n`);

    for (const record of hit.matchingRecords) {
      const role = record.role || "unknown";
      const content = (record.content || record.tool_call_id || "").slice(0, 100);
      console.log(`   [${role}] ${content}${content.length > 100 ? "..." : ""}`);
    }
    console.log();
  }

  if (found.length > 10) {
    console.log(`   ... and ${found.length - 10} more sessions with evidence\n`);
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`SUMMARY: Pattern found in ${found.length}/${results.length} sessions`);
  console.log(`Confidence: ${((found.length / results.length) * 100).toFixed(1)}%`);
  console.log("");
}

const pattern = process.argv[2];
const limit = process.argv[3] || 200;

if (!pattern) {
  console.log(`
Usage: find-evidence.js <pattern> [session-limit]

Search transcripts for keywords/patterns that show a claim is verified.

Examples:
  find-evidence.js "Luna subagent" 50
  find-evidence.js "deny-default" 100
  find-evidence.js "Portfolio topology" 50
  find-evidence.js "LandedWorkProof" 20
  find-evidence.js "bridge verify" 100

Output: Shows all sessions containing the pattern, with matching record snippets.
  `);
  process.exit(1);
}

findEvidence(pattern, parseInt(limit)).catch(console.error);
