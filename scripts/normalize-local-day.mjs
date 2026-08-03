#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { listTrajectories, normalizeToCanonical } from "../dist/index.js";

const specs = [
  {
    label: "ct",
    source: "claude-code",
    root: join(homedir(), ".claude-token", "projects"),
    loader: "file",
  },
  {
    label: "ca",
    source: "claude-code-ca",
    root: join(homedir(), ".claude-a", "projects"),
    loader: "file",
  },
  {
    label: "claude-direct",
    source: "claude-code",
    root: join(homedir(), ".claude", "projects"),
    loader: "file",
  },
  { label: "codex", source: "codex", loader: "file" },
  { label: "cursor", source: "cursor", loader: "path" },
  { label: "pi", source: "pi", loader: "file" },
  { label: "agy", source: "agy", loader: "path" },
  { label: "letta-code", source: "letta-code", loader: "file" },
  { label: "openclaw", source: "openclaw", loader: "file" },
  { label: "hermes", source: "hermes", loader: "unsupported" },
  { label: "openhands", source: "openhands", loader: "unsupported" },
  { label: "deepagents", source: "deepagents", loader: "unsupported" },
];

const { date, output } = parseArgs(process.argv.slice(2));
const start = new Date(`${date}T00:00:00`);
const end = new Date(start);
end.setDate(end.getDate() + 1);

const report = {
  schema: "trajectory-local-day-inventory-v1",
  date,
  generated_at: new Date().toISOString(),
  local_window: { start: start.toISOString(), end: end.toISOString() },
  sources: [],
  totals: { probed_sources: specs.length, active_sources: 0, sessions: 0, records: 0, failed: 0 },
};

for (const spec of specs) {
  const listings = await listAll(spec);
  const active = listings.filter((item) => {
    if (!item.updatedAt) return false;
    const updated = new Date(item.updatedAt);
    return updated >= start && updated < end;
  });
  const source = {
    label: spec.label,
    source: spec.source,
    discovered: listings.length,
    without_updated_at: listings.filter((item) => !item.updatedAt).length,
    active_sessions: active.length,
    sessions: [],
  };
  if (active.length > 0) report.totals.active_sources += 1;

  for (const item of active) {
    report.totals.sessions += 1;
    if (spec.loader === "unsupported") {
      source.sessions.push({
        id: item.id,
        path: item.path,
        updated_at: item.updatedAt,
        status: "unsupported_automatic_loader",
      });
      report.totals.failed += 1;
      continue;
    }
    try {
      const transcript =
        spec.loader === "path" ? item.path : readFileSync(item.path, "utf8");
      const normalized = normalizeToCanonical({
        source: spec.source,
        transcript,
      });
      const recordTypes = countBy(normalized.records, (record) => record.record_type);
      const diagnostics = countBy(normalized.diagnostics, (diagnostic) => diagnostic.code);
      source.sessions.push({
        id: item.id,
        path: item.path,
        updated_at: item.updatedAt,
        status: "normalized",
        records: normalized.records.length,
        record_types: recordTypes,
        diagnostics,
        source_group_ids: [...new Set(normalized.records.map((record) => record.source_group_id))],
      });
      report.totals.records += normalized.records.length;
    } catch (error) {
      source.sessions.push({
        id: item.id,
        path: item.path,
        updated_at: item.updatedAt,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      report.totals.failed += 1;
    }
  }
  report.sources.push(source);
}

const json = `${JSON.stringify(report, null, 2)}\n`;
if (output) writeFileSync(output, json);
else process.stdout.write(json);
if (report.totals.failed > 0) process.exitCode = 1;

async function listAll(spec) {
  const items = [];
  let cursor;
  do {
    const page = await listTrajectories({
      source: spec.source,
      ...(spec.root ? { root: spec.root } : {}),
      ...(cursor ? { cursor } : {}),
      limit: 1000,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function parseArgs(args) {
  const date = args[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    throw new Error("Usage: node scripts/normalize-local-day.mjs YYYY-MM-DD [--output path]");
  }
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !output) throw new Error("--output requires a path");
  return { date, output };
}
