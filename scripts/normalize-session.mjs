#!/usr/bin/env node
/**
 * Normalize one agent session file into trajectory records.
 *
 * Usage:
 *   node scripts/normalize-session.mjs --source pi --file ~/.pi/agent/sessions/.../x.jsonl
 *   node scripts/normalize-session.mjs --source pi --file path.jsonl --out /tmp/out.json
 *
 * Designed for turn-end hooks: small, fast, no network.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] ?? null;
}

function has(name) {
  return args.includes(name);
}

const source = flag("--source") || "pi";
const file = flag("--file");
const out = flag("--out");
const quiet = has("--quiet");

if (!file) {
  console.error(
    "Usage: node scripts/normalize-session.mjs --source <src> --file <path> [--out path] [--quiet]",
  );
  process.exit(2);
}

const abs = resolve(file);
if (!existsSync(abs)) {
  console.error(`file not found: ${abs}`);
  process.exit(1);
}

// Prefer built dist; fall back to src via dynamic import only if dist missing
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(repoRoot, "dist/index.js");
let normalizeTranscript;
if (existsSync(distEntry)) {
  ({ normalizeTranscript } = await import(pathToFileURL(distEntry).href));
} else {
  console.error("dist/index.js missing — run bun run build or npm run build first");
  process.exit(1);
}

const transcript = readFileSync(abs, "utf8");
const started = Date.now();
let result;
try {
  result = normalizeTranscript({
    source,
    transcript,
    sourceContext: { partial: true },
  });
} catch (err) {
  const payload = {
    ok: false,
    source,
    file: abs,
    error: err instanceof Error ? err.message : String(err),
    duration_ms: Date.now() - started,
  };
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), `${JSON.stringify(payload, null, 2)}\n`);
  }
  if (!quiet) console.error(JSON.stringify(payload));
  process.exit(1);
}

const st = statSync(abs);
const id = createHash("sha1").update(abs).digest("hex").slice(0, 12);
const recordTypes = {};
for (const r of result.records) {
  const k = r.role || r.record_type || "unknown";
  recordTypes[k] = (recordTypes[k] || 0) + 1;
}
const diagCodes = {};
for (const d of result.diagnostics || []) {
  const k = d.code || "unknown";
  diagCodes[k] = (diagCodes[k] || 0) + 1;
}

const payload = {
  ok: true,
  schema: "trajectory-session-normalize-v1",
  source,
  file: abs,
  file_basename: basename(abs),
  file_mtime_ms: st.mtimeMs,
  file_bytes: st.size,
  session_key: id,
  normalized_at: new Date().toISOString(),
  duration_ms: Date.now() - started,
  records: result.records.length,
  record_types: recordTypes,
  diagnostics: diagCodes,
  // Keep records out of default stdout (can be large); write full body only to --out
};

const full = { ...payload, body: { records: result.records, diagnostics: result.diagnostics } };

if (out) {
  const outAbs = resolve(out);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, `${JSON.stringify(full, null, 2)}\n`);
  payload.out = outAbs;
}

if (!quiet) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
process.exit(0);
