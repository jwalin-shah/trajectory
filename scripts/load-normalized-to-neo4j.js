#!/usr/bin/env node
/**
 * Load normalized transcripts into Neo4j
 * Creates queryable TranscriptSession nodes with embedded records
 * Records: user messages, assistant responses, tool calls, results
 */

import { normalizeTranscript } from "../dist/index.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const HOME = process.env.HOME || "/Users/jwalinshah";
const NEO4J_URL = process.env.NEO4J_URL || "http://localhost:7474/db/neo4j/tx/commit";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASS = (process.env.NEO4J_PASSWORD || "").trim();
if (!NEO4J_PASS) {
  throw new Error("NEO4J_PASSWORD is required; refusing an implicit credential");
}

const ADAPTERS = [
  { name: "CT", source: "claude-code", dir: path.join(HOME, ".claude-token/projects") },
  { name: "CA", source: "claude-code-ca", dir: path.join(HOME, ".claude-a/projects") },
  { name: "PI", source: "pi", dir: path.join(HOME, ".pi/agent/sessions") },
  { name: "Codex", source: "codex", dir: path.join(HOME, ".codex") },
  { name: "Cursor", source: "cursor", dir: path.join(HOME, ".cursor/chats") },
  { name: "Agy", source: "agy", dir: path.join(HOME, ".gemini/antigravity-cli/conversations") },
];

async function queryNeo4j(cypher, params = {}) {
  const auth = Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString("base64");
  const response = await fetch(NEO4J_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify({
      statements: [{ statement: cypher, parameters: params }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Neo4j error: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors?.length > 0) {
    throw new Error(`Neo4j query error: ${data.errors[0].message}`);
  }
  return data.results?.[0];
}

function findJsonlFiles(dir) {
  const files = [];
  try {
    const walk = (d) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }
    };
    walk(dir);
  } catch (e) {}
  return files;
}

function findCursorDatabases(dir) {
  const files = [];
  try {
    const projectIds = fs.readdirSync(dir);
    for (const projectId of projectIds) {
      const projectPath = path.join(dir, projectId);
      if (fs.statSync(projectPath).isDirectory()) {
        const sessionIds = fs.readdirSync(projectPath);
        for (const sessionId of sessionIds) {
          const storeDb = path.join(projectPath, sessionId, "store.db");
          if (fs.existsSync(storeDb)) {
            files.push(storeDb);
          }
        }
      }
    }
  } catch (e) {}
  return files;
}

(async () => {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║  LOAD ALL NORMALIZED TRANSCRIPTS TO NEO4J             ║");
  console.log("║  7,317 sessions → persisted + queryable                ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Test connection
  try {
    await queryNeo4j("MATCH (a:Axiom) RETURN count(a)");
    console.log("✓ Connected to Neo4j\n");
  } catch (e) {
    console.error("✗ Cannot connect to Neo4j:", e.message);
    process.exit(1);
  }

  let totalLoaded = 0;
  let totalRecords = 0;

  for (const adapter of ADAPTERS) {
    console.log(`\n${adapter.name}:`);
    console.log("─".repeat(60));

    let files = [];
    if (adapter.source === "cursor") {
      files = findCursorDatabases(adapter.dir);
    } else if (adapter.source === "agy") {
      const agyDir = adapter.dir;
      try {
        files = fs
          .readdirSync(agyDir)
          .filter((f) => f.endsWith(".db"))
          .map((f) => path.join(agyDir, f));
      } catch (e) {}
    } else if (fs.existsSync(adapter.dir)) {
      files = findJsonlFiles(adapter.dir);
    }

    console.log(`Found ${files.length} files...`);

    let batchLogged = 0;
    for (let idx = 0; idx < files.length; idx++) {
      const filePath = files[idx];

      try {
        let content;
        if (adapter.source === "cursor" || adapter.source === "agy") {
          content = filePath;
        } else {
          content = fs.readFileSync(filePath, "utf-8");
        }

        const result = normalizeTranscript({
          source: adapter.source,
          transcript: content,
        });

        if (result.records?.length === 0) continue;

        const sessionId = crypto
          .createHash("sha256")
          .update(filePath)
          .digest("hex")
          .slice(0, 16);

        const messageCount = result.records.filter(r => r.role === "user" || r.role === "assistant").length;
        const toolCount = result.records.filter(r => r.role === "tool").length;

        const cypher = `
          CREATE (s:TranscriptSession {
            id: $id,
            source: $source,
            adapter: $adapter,
            path: $path,
            messageCount: $msgCount,
            toolCount: $toolCount,
            recordCount: $recCount,
            timestamp: $timestamp,
            records: $records
          })
        `;

        await queryNeo4j(cypher, {
          id: sessionId,
          source: adapter.source,
          adapter: adapter.name,
          path: filePath,
          msgCount: messageCount,
          toolCount: toolCount,
          recCount: result.records.length,
          timestamp: new Date().toISOString(),
          records: JSON.stringify(result.records),
        });

        totalLoaded++;
        totalRecords += result.records.length;

        // Log progress
        if (idx - batchLogged >= 200) {
          const pct = Math.round((idx / files.length) * 100);
          console.log(`  ${pct}% (${idx}/${files.length}) - ${totalRecords} total records`);
          batchLogged = idx;
        }
      } catch (e) {
        // Skip on error
      }
    }

    console.log(`✓ ${adapter.name}: Loaded ${totalLoaded} sessions, ${totalRecords} records`);
  }

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  LOAD COMPLETE                                         ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  console.log(`✓ Loaded ${totalLoaded} sessions`);
  console.log(`✓ Total records: ${totalRecords}`);

  // Verify
  const result = await queryNeo4j("MATCH (s:TranscriptSession) RETURN count(s) as total");
  const count = result?.data?.[0]?.row?.[0] || 0;
  console.log(`✓ Neo4j now contains ${count} TranscriptSession nodes\n`);

  console.log("Sample queries:");
  console.log("  MATCH (s:TranscriptSession) WHERE s.adapter='CT' RETURN s.id, s.messageCount");
  console.log("  MATCH (s:TranscriptSession) WHERE s.toolCount > 0 RETURN s.id, s.toolCount");
  console.log("  MATCH (s:TranscriptSession) RETURN avg(s.messageCount) as avgMessages\n");

  process.exit(0);
})();
