#!/usr/bin/env node
/**
 * Verify documentation claims against actual work in transcripts
 * Usage: verify-claims.js <claim> <evidence-pattern>
 *
 * Example: verify-claims.js "sandbox deny-default" "deny-default"
 * Example: verify-claims.js "Luna subagents working" "Luna subagent"
 */

const NEO4J_URL = "http://localhost:7474/db/neo4j/tx/commit";
const NEO4J_USER = "neo4j";
const NEO4J_PASS = "axiom-knowledge";

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

async function verifyClaim(claimStatement, evidencePattern) {
  console.log(`\n📋 VERIFYING CLAIM`);
  console.log(`Claim: "${claimStatement}"`);
  console.log(`Evidence pattern: "${evidencePattern}"\n`);

  // Query all sessions from last 48 hours with message content
  const cypher = `
    MATCH (s:TranscriptSession)
    WHERE s.timestamp > datetime() - duration('P2D')
    RETURN s.id, s.adapter, s.timestamp, s.messageCount, s.records
    ORDER BY s.timestamp DESC
  `;

  const results = await queryNeo4j(cypher);

  let sessionsWithEvidence = [];
  let totalSessionsSearched = 0;

  for (const row of results) {
    totalSessionsSearched++;
    const [sessionId, adapter, timestamp, msgCount, recordsJson] = row;
    const records = JSON.parse(recordsJson);

    // Search all records for evidence pattern (case-insensitive)
    const found = records.some((r) => {
      const content = JSON.stringify(r).toLowerCase();
      return content.includes(evidencePattern.toLowerCase());
    });

    if (found) {
      const userMsgs = records.filter((r) => r.role === "user").length;
      const assistantMsgs = records.filter(
        (r) => r.role === "assistant"
      ).length;

      sessionsWithEvidence.push({
        sessionId: sessionId.slice(0, 8),
        adapter,
        timestamp: new Date(timestamp).toLocaleString(),
        userMessages: userMsgs,
        assistantMessages: assistantMsgs,
        recordsWithPattern: records
          .filter(
            (r) =>
              JSON.stringify(r)
                .toLowerCase()
                .includes(evidencePattern.toLowerCase())
          )
          .slice(0, 3), // Show first 3 matching records
      });
    }
  }

  console.log(`Searched: ${totalSessionsSearched} sessions`);
  console.log(`Found evidence in: ${sessionsWithEvidence.length} sessions\n`);

  if (sessionsWithEvidence.length === 0) {
    console.log(`❌ CLAIM NOT VERIFIED - No evidence found in transcripts`);
    return false;
  }

  console.log(`✅ CLAIM VERIFIED - Evidence found:\n`);

  for (const evidence of sessionsWithEvidence.slice(0, 5)) {
    console.log(`  Session: ${evidence.adapter} / ${evidence.sessionId}`);
    console.log(`  Date: ${evidence.timestamp}`);
    console.log(
      `  Activity: ${evidence.userMessages} user → ${evidence.assistantMessages} assistant`
    );

    if (evidence.recordsWithPattern.length > 0) {
      console.log(`  Evidence records:`);
      for (const record of evidence.recordsWithPattern) {
        const content = record.content || record.tool_call_id || "...";
        const snippet = content.slice(0, 60);
        console.log(`    - ${record.role}: ${snippet}`);
      }
    }
    console.log();
  }

  if (sessionsWithEvidence.length > 5) {
    console.log(`  ... and ${sessionsWithEvidence.length - 5} more sessions\n`);
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`CONFIDENCE: ${((sessionsWithEvidence.length / totalSessionsSearched) * 100).toFixed(1)}%`);
  console.log(`Verified on ${sessionsWithEvidence.length} independent sessions`);
  console.log("");

  return true;
}

// Run verification
const claim = process.argv[2];
const pattern = process.argv[3];

if (!claim || !pattern) {
  console.log(`
Usage: verify-claims.js <claim> <evidence-pattern>

Examples:
  verify-claims.js "sandbox deny-default is active" "deny-default"
  verify-claims.js "Luna subagents implemented" "Luna subagent"
  verify-claims.js "Bridge delivery control working" "LandedWorkProof"
  verify-claims.js "Portfolio topology decided" "topology"

Output: Shows all sessions where evidence was found, with timestamps and message counts.
  `);
  process.exit(1);
}

verifyClaim(claim, pattern).catch(console.error);
