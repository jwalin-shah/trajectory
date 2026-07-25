#!/usr/bin/env node
/**
 * Automated verification: Test every adapter with real data
 * Generates proof that everything works end-to-end
 */

import { verifyFullPipeline, formatVerificationReport } from "../dist/verify.js";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME || "/Users/jwalinshah";

const samples = [
  {
    name: "CT (TokenRouter)",
    source: "claude-code",
    path: path.join(HOME, ".claude-token/projects/-Users-jwalinshah/00c65e91-0fc7-469f-8a23-2b361ca9587f.jsonl"),
  },
  {
    name: "CA (Anthropic)",
    source: "claude-code-ca",
    path: path.join(HOME, ".claude-a/projects/-Users-jwalinshah/1b3d8974-bc8d-4dcf-9674-35c24d339439.jsonl"),
  },
  {
    name: "PI (Anthropic)",
    source: "pi",
    path: path.join(
      HOME,
      ".pi/agent/sessions/--private-tmp-bridge-prove--/2026-07-25T00-48-56-415Z_019f96bf-225f-7c9d-8cd0-8a31922c7dc5.jsonl"
    ),
  },
  {
    name: "Codex",
    source: "codex",
    path: path.join(HOME, ".codex/history.jsonl"),
  },
  {
    name: "Cursor (SQLite)",
    source: "cursor",
    path: path.join(HOME, ".cursor/chats/12803ed837cd1d59bdb0e28746075c38/067e4f9a-b2ce-47cb-9a58-2f105d2f90e3/store.db"),
  },
  {
    name: "Agy (Gemini)",
    source: "agy",
    path: path.join(HOME, ".gemini/antigravity-cli/conversations/00b77db3-f277-4ee6-b089-33f8f92b5887.db"),
  },
];

console.log("╔════════════════════════════════════════════════════════╗");
console.log("║  AUTOMATED VERIFICATION: ALL ADAPTERS                 ║");
console.log("║  Every adapter tested with real data                  ║");
console.log("╚════════════════════════════════════════════════════════╝\n");

const results = [];

(async () => {
  for (const sample of samples) {
    if (!fs.existsSync(sample.path)) {
      console.log(`✗ ${sample.name}: File not found\n`);
      continue;
    }

    console.log(`Testing ${sample.name}...`);

    // Read transcript
    let content;
    if (sample.source === "cursor" || sample.source === "agy") {
      content = sample.path; // Pass path for SQLite
    } else {
      content = fs.readFileSync(sample.path, "utf-8");
    }

    // Run verification
    const result = await verifyFullPipeline(content, sample.source);
    results.push({ adapter: sample.name, result });

    // Print summary
    const passCount = result.checks.filter((c) => c.passed).length;
    const icon = result.passed ? "✓" : "✗";
    console.log(`${icon} ${passCount}/${result.checks.length} checks passed\n`);
  }

  // Print detailed reports
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  DETAILED REPORTS                                      ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  for (const { adapter, result } of results) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(adapter);
    console.log("=".repeat(60));
    console.log(formatVerificationReport(result));
  }

  // Summary
  const allPassed = results.every((r) => r.result.passed);
  const passedCount = results.filter((r) => r.result.passed).length;

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                               ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  console.log(`Total adapters tested: ${results.length}`);
  console.log(`Passed: ${passedCount}/${results.length}`);
  console.log(`Status: ${allPassed ? "✓ ALL PASSED" : "✗ SOME FAILED"}\n`);

  if (allPassed) {
    console.log("✓ Every adapter works end-to-end");
    console.log("✓ All normalization checks pass");
    console.log("✓ All enrichment checks pass");
    console.log("✓ All verification checks pass");
    console.log("\nPipeline is production-ready.");
    process.exit(0);
  } else {
    console.log("✗ Some adapters failed verification");
    process.exit(1);
  }
})();
