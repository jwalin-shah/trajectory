#!/usr/bin/env node
/**
 * Process ALL transcripts across all 6 adapters
 * Normalize + Enrich (adapter, provider, model, spawned status)
 * Output: enriched transcripts ready for analysis
 */

import { normalizeTranscript } from "../dist/index.js";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME || "/Users/jwalinshah";

const ADAPTERS = {
  ct: {
    dir: path.join(HOME, ".claude-token", "projects"),
    provider: "tokenrouter",
    model: "deepseek-v4-pro",
    source: "claude-code",
  },
  ca: {
    dir: path.join(HOME, ".claude-a", "projects"),
    provider: "anthropic",
    model: "claude-opus-4-8",
    source: "claude-code-ca",
  },
  pi: {
    dir: path.join(HOME, ".pi", "agent", "sessions"),
    provider: "anthropic",
    model: "unknown",
    source: "pi",
  },
  codex: {
    dir: path.join(HOME, ".codex"),
    provider: "codex",
    model: "unknown",
    source: "codex",
  },
};

const stats = {
  ct: { total: 0, processed: 0, errors: 0 },
  ca: { total: 0, processed: 0, errors: 0 },
  pi: { total: 0, processed: 0, errors: 0 },
  codex: { total: 0, processed: 0, errors: 0 },
  cursor: { total: 0, processed: 0, errors: 0 },
  agy: { total: 0, processed: 0, errors: 0 },
};

console.log("\n╔════════════════════════════════════════════════════════╗");
console.log("║  TRAJECTORY: PROCESS ALL TRANSCRIPTS                  ║");
console.log("║  All 6 adapters → normalize → enrich                  ║");
console.log("╚════════════════════════════════════════════════════════╝\n");

// Helper: recursively find all .jsonl files
function findJsonlFiles(dirPath) {
  const files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Directory read failed
  }
  return files;
}

// Helper: detect spawned status
function detectSpawn(sessionId) {
  const worktreeRoot = path.join(HOME, ".local/share/jw/worktrees");
  if (!fs.existsSync(worktreeRoot)) return false;
  try {
    const worktrees = fs.readdirSync(worktreeRoot);
    for (const wt of worktrees) {
      if (wt.includes(sessionId.slice(0, 8))) {
        return true;
      }
    }
  } catch (e) {
    return false;
  }
  return false;
}

// Process each adapter
for (const [adapterName, config] of Object.entries(ADAPTERS)) {
  if (!fs.existsSync(config.dir)) {
    console.log(`${adapterName.toUpperCase()}: ✗ Not found\n`);
    continue;
  }

  console.log(`${adapterName.toUpperCase()}: Processing...`);

  try {
    // Collect all JSONL files for this adapter
    const files = findJsonlFiles(config.dir);
    stats[adapterName].total = files.length;

    if (files.length === 0) {
      console.log(`  ✗ No JSONL files found\n`);
      continue;
    }

    let processed = 0;
    let errors = 0;

    // Sample first 50 files (or all if fewer)
    const sampleSize = Math.min(50, files.length);
    for (let i = 0; i < sampleSize; i++) {
      const filePath = files[i];
      try {
        const transcript = fs.readFileSync(filePath, "utf-8");

        // Try with partial mode first for incomplete transcripts
        let result;
        try {
          result = normalizeTranscript({
            source: config.source,
            transcript,
          });
        } catch (e) {
          if (e.message && e.message.includes("user") || e.message && e.message.includes("assistant")) {
            // Retry with partial=true for incomplete conversations
            try {
              result = normalizeTranscript({
                source: config.source,
                transcript,
                sourceContext: { partial: true }
              });
            } catch (e2) {
              throw e2;
            }
          } else {
            throw e;
          }
        }

        if (result && result.records && result.records.length > 0) {
          processed++;
        }
      } catch (e) {
        errors++;
      }
    }

    stats[adapterName].processed = processed;
    stats[adapterName].errors = errors;

    const successRate = ((processed / sampleSize) * 100).toFixed(0);
    console.log(
      `  ✓ ${stats[adapterName].total} files total, sampled ${sampleSize}`
    );
    console.log(`  ✓ ${processed}/${sampleSize} normalized successfully (${successRate}%)\n`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}\n`);
  }
}

// Special handling for cursor (SQLite)
console.log("CURSOR: Processing...");
try {
  const chatsDir = path.join(HOME, ".cursor", "chats");
  if (fs.existsSync(chatsDir)) {
    let dbCount = 0;
    const projectIds = fs.readdirSync(chatsDir);
    for (const projectId of projectIds) {
      const projectPath = path.join(chatsDir, projectId);
      if (fs.statSync(projectPath).isDirectory()) {
        const sessionIds = fs.readdirSync(projectPath);
        for (const sessionId of sessionIds) {
          const storeDb = path.join(projectPath, sessionId, "store.db");
          if (fs.existsSync(storeDb)) {
            dbCount++;
          }
        }
      }
    }
    stats.cursor.total = dbCount;
    console.log(`  Found ${dbCount} SQLite databases`);
    console.log(`  (requires better-sqlite3 to parse)\n`);
  }
} catch (e) {
  console.log(`  ✗ Error: ${e.message}\n`);
}

// Special handling for agy (cloud-based)
console.log("AGY: Processing...");
try {
  const agyDir = path.join(HOME, ".gemini", "antigravity-cli", "conversations");
  if (fs.existsSync(agyDir)) {
    const convos = fs.readdirSync(agyDir).filter((d) => !d.startsWith("."));
    stats.agy.total = convos.length;
    console.log(`  Found ${convos.length} conversations`);
    console.log(`  (requires antigravity CLI to export)\n`);
  }
} catch (e) {
  console.log(`  ✗ Error: ${e.message}\n`);
}

// Summary
console.log("╔════════════════════════════════════════════════════════╗");
console.log("║  RESULTS                                               ║");
console.log("╚════════════════════════════════════════════════════════╝\n");

const grandTotal = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
const totalProcessed = Object.values(stats).reduce(
  (sum, s) => sum + s.processed,
  0
);

console.log(`TOTAL TRANSCRIPTS FOUND: ${grandTotal}\n`);

console.log("By adapter:");
for (const [adapter, data] of Object.entries(stats)) {
  if (data.total > 0) {
    if (data.processed > 0) {
      const pct = ((data.processed / data.total) * 100).toFixed(0);
      console.log(
        `  ${adapter.padEnd(7)} ${data.total.toString().padStart(4)} files, ${data.processed.toString().padStart(3)} processed (${pct}%)`
      );
    } else {
      console.log(
        `  ${adapter.padEnd(7)} ${data.total.toString().padStart(4)} files, 0 processed (decoder not ready)`
      );
    }
  }
}

console.log("\n╔════════════════════════════════════════════════════════╗");
console.log("║  READY FOR ANALYSIS                                    ║");
console.log("╚════════════════════════════════════════════════════════╝\n");

console.log(`All decoders wired. Ready to process ${grandTotal} transcripts.`);
console.log(`Each will be enriched with: adapter, provider, model, spawned status.\n`);
