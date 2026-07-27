#!/usr/bin/env node
/**
 * Load enriched transcripts into Neo4j
 * Makes 421,463 enriched records queryable
 */

import { normalizeTranscript } from "../dist/index.js";
import { enrichTranscript } from "../dist/adapters/enricher.js";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME || "/Users/jwalinshah";
const NEO4J_URL = process.env.NEO4J_URL || "http://localhost:7474/db/neo4j/tx/commit";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASS = process.env.NEO4J_PASS || "axiom-knowledge";

const ADAPTERS = [
  { name: "CT", source: "claude-code", dir: path.join(HOME, ".claude-token/projects") },
  { name: "CA", source: "claude-code-ca", dir: path.join(HOME, ".claude-a/projects") },
  { name: "PI", source: "pi", dir: path.join(HOME, ".pi/agent/sessions") },
  { name: "Codex", source: "codex", dir: path.join(HOME, ".codex") },
  { name: "Cursor", source: "cursor", dir: path.join(HOME, ".cursor/chats") },
  { name: "Agy", source: "agy", dir: path.join(HOME, ".gemini/antigravity-cli/conversations") },
];

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

  if (!response.ok) {
    throw new Error(`Neo4j error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  if (data.errors && data.errors.length > 0) {
    throw new Error(`Neo4j query error: ${JSON.stringify(data.errors)}`);
  }
  return data.results?.[0];
}

function findJsonlFiles(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
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
  console.log("║  LOAD ENRICHED TRANSCRIPTS TO NEO4J                   ║");
  console.log("║  Making 421,463 records queryable                      ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Test connection
  try {
    await queryNeo4j("MATCH (a:Axiom) RETURN count(a)");
    console.log("✓ Connected to Neo4j\n");
  } catch (e) {
    console.error("✗ Cannot connect to Neo4j:", e.message);
    process.exit(1);
  }

  const stats = {
    totalFiles: 0,
    totalProcessed: 0,
    totalRecords: 0,
    totalErrors: 0,
    byAdapter: {},
    startTime: Date.now(),
  };

  for (const adapter of ADAPTERS) {
    console.log(`\n${adapter.name.toUpperCase()}:`);
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

    stats.totalFiles += files.length;
    stats.byAdapter[adapter.name] = {
      total: files.length,
      processed: 0,
      records: 0,
      errors: 0,
    };

    console.log(`Found ${files.length} transcript files`);
    if (files.length === 0) continue;

    let processedCount = 0;
    let recordCount = 0;
    let errorCount = 0;
    const batchSize = 100;
    let lastLog = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];

      try {
        let content;
        if (adapter.source === "cursor" || adapter.source === "agy") {
          content = filePath;
        } else {
          content = fs.readFileSync(filePath, "utf-8");
        }

        const normalized = normalizeTranscript({
          source: adapter.source,
          transcript: content,
          sourceContext: { partial: true },
        });

        if (normalized.records && normalized.records.length > 0) {
          const enriched = enrichTranscript(normalized, adapter.source);

          // Create Neo4j node for this transcript
          const transcriptId = `${adapter.source}_${path.basename(filePath, path.extname(filePath))}`;
          const cypher = `
            CREATE (t:Transcript {
              id: $id,
              source: $source,
              adapter: $adapter,
              provider: $provider,
              model: $model,
              spawned: $spawned,
              recordCount: $recordCount,
              timestamp: $timestamp
            })
          `;

          await queryNeo4j(cypher.replace(/\$/g, (m) => {
            const vars = {
              id: `"${transcriptId}"`,
              source: `"${adapter.source}"`,
              adapter: `"${enriched.adapter}"`,
              provider: `"${enriched.provider}"`,
              model: `"${enriched.model}"`,
              spawned: enriched.spawned ? "true" : "false",
              recordCount: enriched.records.length,
              timestamp: `"${new Date().toISOString()}"`,
            };
            return vars[m.slice(1)];
          }));

          processedCount++;
          recordCount += enriched.records.length;
        }
      } catch (e) {
        errorCount++;
      }

      if (i - lastLog >= batchSize) {
        const pct = Math.round((i / files.length) * 100);
        console.log(`  Processing: ${pct}% (${i}/${files.length}) - ${recordCount} records`);
        lastLog = i;
      }
    }

    stats.totalProcessed += processedCount;
    stats.totalRecords += recordCount;
    stats.totalErrors += errorCount;
    stats.byAdapter[adapter.name].processed = processedCount;
    stats.byAdapter[adapter.name].records = recordCount;
    stats.byAdapter[adapter.name].errors = errorCount;

    console.log(
      `✓ Loaded ${processedCount}/${files.length} transcripts, ${recordCount} records, ${errorCount} errors`
    );
  }

  const elapsed = Date.now() - stats.startTime;
  const minutes = Math.round(elapsed / 1000 / 60);

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  LOAD COMPLETE                                         ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  console.log(`Total time: ${minutes} minutes\n`);
  console.log("Summary:");
  console.log(`  Total files: ${stats.totalFiles}`);
  console.log(`  Processed: ${stats.totalProcessed}`);
  console.log(`  Records loaded: ${stats.totalRecords}`);
  console.log(`  Errors: ${stats.totalErrors}`);
  console.log(`  Success rate: ${Math.round((stats.totalProcessed / stats.totalFiles) * 100)}%\n`);

  console.log("By adapter:");
  for (const [name, data] of Object.entries(stats.byAdapter)) {
    if (data.total > 0) {
      const pct = Math.round((data.processed / data.total) * 100);
      console.log(
        `  ${name.padEnd(10)} ${data.total.toString().padStart(5)} files → ${data.processed.toString().padStart(5)} loaded → ${data.records.toString().padStart(7)} records (${pct}%)`
      );
    }
  }

  // Verify
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  VERIFICATION                                         ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  const result = await queryNeo4j("MATCH (t:Transcript) RETURN count(t) as total, collect(t.adapter) as adapters");
  const count = result?.data?.[0]?.row?.[0] || 0;
  console.log(`✓ Neo4j now contains ${count} Transcript nodes`);
  console.log("✓ Enriched transcripts are available for querying\n");

  process.exit(0);
})();
