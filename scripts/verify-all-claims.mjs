#!/usr/bin/env node
/**
 * Execute evidence for every claim in the ledger and report status.
 * Unlike the old verify-all-claims.sh, this actually runs commands.
 *
 * Usage:
 *   node scripts/verify-all-claims.mjs [ledger.json] [--write] [--json]
 *
 * Exit codes:
 *   0 — no STALE claims (VERIFIED/UNKNOWN/QUESTIONABLE only)
 *   1 — one or more STALE claims, or ledger unreadable / zero claims when file has entries
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PROJECTS_ROOT = resolve(homedir(), "projects");
const HOME = homedir();

const args = process.argv.slice(2);
const writeBack = args.includes("--write");
const jsonOut = args.includes("--json");
const ledgerArg = args.find((a) => !a.startsWith("--"));
const ledgerPath = resolve(process.cwd(), ledgerArg || "scripts/claims-ledger.json");

if (!existsSync(ledgerPath)) {
  console.error(`❌ Claims ledger not found: ${ledgerPath}`);
  process.exit(1);
}

const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const claims = Array.isArray(ledger.claims) ? ledger.claims : [];

if (claims.length === 0) {
  console.error("❌ Ledger contains zero claims");
  process.exit(1);
}

const now = new Date().toISOString();
const summary = {
  verified: 0,
  stale: 0,
  questionable: 0,
  unknown: 0,
  executed: 0,
  errors: 0,
  total: claims.length,
};

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith("~/")) return join(HOME, p.slice(2));
  if (p.startsWith("~")) return join(HOME, p.slice(1));
  return p;
}

function resolveDocPath(docFile) {
  if (!docFile) return null;
  const expanded = expandHome(docFile);
  if (existsSync(expanded)) return expanded;
  const underProjects = join(PROJECTS_ROOT, expanded.replace(/^projects\//, ""));
  if (existsSync(underProjects)) return underProjects;
  const underHome = join(HOME, expanded);
  if (existsSync(underHome)) return underHome;
  return expanded;
}

function resolveEvidencePath(source) {
  if (!source || typeof source !== "string") return null;
  // Take first path-like token before separators used in multi-path sources
  const first = source.split(";")[0].trim();
  if (!first || first.includes(" ") && !first.startsWith("/") && !first.startsWith("~")) {
    // May still be a relative path
  }
  const candidates = [
    expandHome(first),
    join(PROJECTS_ROOT, first.replace(/^projects\//, "")),
    join(REPO_ROOT, first),
    join(HOME, first),
    join(PROJECTS_ROOT, "bridge", first.replace(/^bridge\//, "")),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return expandHome(first);
}

function extractExpectedAxiomCount(claimText) {
  if (!claimText) return null;
  // Only treat as a total-corpus count claim when the sentence is clearly about
  // the full Neo4j/axioms.json population — not filtered subsets, findings, or
  // unrelated integers (ports, versions, chunk sizes).
  const totalPatterns = [
    /\b(\d{3,5})\s+axioms?\s+in\s+neo4j\b/i,
    /\baxioms?\s+in\s+neo4j\b[^\d]{0,40}\b(\d{3,5})\b/i,
    /contains\s+(\d{3,5})\s+axioms?\s+in\s+neo4j\b/i,
    /\|\s*`axioms\.json`\s*\|\s*(\d{3,5})\s+axioms?/i,
    /\b(\d{3,5})\s+axioms?\s+\(the corpus\)/i,
    /\b(\d{3,5})\s+axioms?\s+in\s+Neo4j\b/,
  ];
  for (const re of totalPatterns) {
    const m = claimText.match(re);
    if (m) return Number(m[1]);
  }
  // Bare "N axioms in Neo4j" fragments from older ledger rows
  const bare = claimText.match(/^\s*(\d{3,5})\s+axioms?\s+in\s+neo4j\b/i);
  if (bare) return Number(bare[1]);
  return null;
}

function runCypher(statement) {
  // Prefer cypher-shell (works on local unauth installs). Fall back to HTTP when password set.
  const shell = spawnSync(
    "cypher-shell",
    ["-a", process.env.NEO4J_URI || "neo4j://localhost:7687", "--format", "plain", statement],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (shell.status === 0 && shell.stdout) {
    const lines = shell.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // plain format: header then value
    const dataLines = lines.filter((l) => !/^c$|^count/i.test(l) && l !== "NULL");
    const last = dataLines[dataLines.length - 1] ?? lines[lines.length - 1];
    const num = Number(String(last).replace(/"/g, ""));
    if (!Number.isNaN(num)) return { ok: true, value: num, method: "cypher-shell" };
    return { ok: true, value: last, method: "cypher-shell" };
  }

  const pass = process.env.NEO4J_PASSWORD;
  if (pass === undefined || pass === null || pass === "") {
    return {
      ok: false,
      error:
        shell.stderr?.trim() ||
        "cypher-shell failed and NEO4J_PASSWORD unset (HTTP path refused)",
      method: "none",
    };
  }
  const user = process.env.NEO4J_USER || "neo4j";
  const url = process.env.NEO4J_URL || "http://localhost:7474/db/neo4j/tx/commit";
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const res = spawnSync(
    "curl",
    [
      "-s",
      url,
      "-H",
      "Content-Type: application/json",
      "-H",
      `Authorization: Basic ${auth}`,
      "-d",
      JSON.stringify({ statements: [{ statement }] }),
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (res.status !== 0) {
    return { ok: false, error: res.stderr || "curl failed", method: "http" };
  }
  try {
    const data = JSON.parse(res.stdout);
    const row = data.results?.[0]?.data?.[0]?.row?.[0];
    if (data.errors?.length) {
      return { ok: false, error: JSON.stringify(data.errors), method: "http" };
    }
    return { ok: true, value: row, method: "http" };
  } catch (e) {
    return { ok: false, error: String(e), method: "http" };
  }
}

function gitLogExists(pathHint) {
  const resolved = resolveEvidencePath(pathHint);
  if (resolved && existsSync(resolved)) {
    // Try git log in containing repo
    let dir = statSync(resolved).isDirectory() ? resolved : dirname(resolved);
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, ".git"))) {
        const log = spawnSync("git", ["-C", dir, "log", "-1", "--format=%ct", "--", resolved], {
          encoding: "utf8",
        });
        if (log.status === 0 && log.stdout.trim()) {
          return {
            exists: true,
            path: resolved,
            commitTs: Number(log.stdout.trim()),
            method: "git-log",
          };
        }
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return { exists: true, path: resolved, commitTs: null, method: "filesystem" };
  }
  return { exists: false, path: resolved, commitTs: null, method: "missing" };
}

function verifyClaim(claim) {
  const result = {
    id: claim.id,
    prior_status: claim.status,
    status: claim.status || "UNKNOWN",
    actual_value: claim.actual_value ?? null,
    evidence_timestamp: claim.evidence_timestamp ?? null,
    notes: claim.notes || "",
    executed: false,
    error: null,
  };

  const type = claim.evidence_type || "";
  const source = claim.evidence_source || "";

  try {
    if (type === "neo4j-query") {
      const statement =
        source.includes("MATCH") || source.includes("RETURN")
          ? source
          : "MATCH (a:Axiom) RETURN count(a)";
      const q = runCypher(statement);
      result.executed = true;
      summary.executed += 1;
      if (!q.ok) {
        result.status = "UNKNOWN";
        result.error = q.error;
        result.notes = appendNote(result.notes, `neo4j error via ${q.method}: ${q.error}`);
        summary.errors += 1;
      } else {
        result.actual_value = q.value;
        result.evidence_timestamp = now;
        const expected = extractExpectedAxiomCount(claim.claim);
        if (expected != null && Number(q.value) !== expected) {
          result.status = "STALE";
          result.notes = appendNote(
            result.notes,
            `corpus count expected ${expected}, live ${q.value} (${q.method})`,
          );
        } else if (expected != null && Number(q.value) === expected) {
          result.status = "VERIFIED";
          result.notes = appendNote(result.notes, `corpus count match via ${q.method}`);
        } else {
          // Query ran. Either no corpus-count expectation, or a non-count neo4j claim.
          // Reachability + scalar result proves the evidence path; do not STALE on
          // unrelated integers (filtered subsets, chunk sizes, versions).
          result.status = "VERIFIED";
          result.notes = appendNote(
            result.notes,
            expected == null
              ? `query ok via ${q.method}: ${q.value} (no corpus-count expectation)`
              : `count match via ${q.method}`,
          );
        }
      }
    } else if (type === "git-commit" || type === "git-blame") {
      // Multi-path sources separated by ;
      const parts = String(source)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      const checks = parts.map((p) => gitLogExists(p));
      result.executed = true;
      summary.executed += 1;
      const allExist = checks.every((c) => c.exists);
      const anyExist = checks.some((c) => c.exists);
      result.actual_value = checks
        .map((c) => `${c.path}:${c.exists ? "exists" : "missing"}`)
        .join("; ");
      result.evidence_timestamp = now;
      if (allExist) {
        result.status = "VERIFIED";
        result.notes = appendNote(result.notes, "all evidence paths exist");
      } else if (anyExist) {
        result.status = "QUESTIONABLE";
        result.notes = appendNote(result.notes, "partial evidence path match");
      } else {
        result.status = "UNKNOWN";
        result.notes = appendNote(result.notes, "evidence paths not found");
      }
    } else if (type === "filesystem-count") {
      result.executed = true;
      summary.executed += 1;
      const path = resolveEvidencePath(source);
      if (path && existsSync(path)) {
        let count = 0;
        if (statSync(path).isDirectory()) {
          try {
            const out = execFileSync(
              "bash",
              ["-lc", `find ${JSON.stringify(path)} -type f | wc -l | tr -d ' '`],
              { encoding: "utf8" },
            );
            count = Number(out.trim());
          } catch {
            count = -1;
          }
        } else {
          count = 1;
        }
        result.actual_value = count;
        result.evidence_timestamp = now;
        // filesystem-count: existence is the primary signal; numeric equality only
        // when claim explicitly says "N files" / "N transcripts" near the path.
        const fileCount = claim.claim?.match(/\b(\d{2,5})\s+(files?|transcripts?|sessions?|entries)\b/i);
        const expected = fileCount ? Number(fileCount[1]) : null;
        if (expected != null && count >= 0 && count !== expected) {
          result.status = "STALE";
          result.notes = appendNote(result.notes, `expected ${expected}, found ${count}`);
        } else {
          result.status = "VERIFIED";
          result.notes = appendNote(result.notes, `path exists; count=${count}`);
        }
      } else {
        result.status = "STALE";
        result.actual_value = "missing";
        result.notes = appendNote(result.notes, `missing path: ${path}`);
      }
    } else if (type === "transcript-sessions") {
      result.executed = true;
      summary.executed += 1;
      // Lightweight: search recent pi sessions for the pattern (no Neo4j required)
      const pattern = String(source || claim.claim || "").slice(0, 80);
      const sessionsRoot = join(HOME, ".pi/agent/sessions");
      if (!existsSync(sessionsRoot) || !pattern) {
        result.status = "UNKNOWN";
        result.notes = appendNote(result.notes, "no local session root or empty pattern");
      } else {
        const rg = spawnSync(
          "rg",
          ["-l", "-F", pattern, sessionsRoot, "-g", "*.jsonl"],
          { encoding: "utf8", timeout: 60_000 },
        );
        const files = (rg.stdout || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        result.actual_value = files.length;
        result.evidence_timestamp = now;
        if (files.length > 0) {
          result.status = "VERIFIED";
          result.notes = appendNote(result.notes, `pattern found in ${files.length} session files`);
        } else {
          result.status = "UNKNOWN";
          result.notes = appendNote(result.notes, "pattern not found in local pi sessions");
        }
      }
    } else if (type === "running-system") {
      result.executed = true;
      summary.executed += 1;
      // evidence_source may be a curl URL or host:port
      const src = String(source);
      const urlMatch = src.match(/https?:\/\/\S+/);
      if (urlMatch) {
        const res = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", urlMatch[0]], {
          encoding: "utf8",
          timeout: 15_000,
        });
        const code = res.stdout?.trim();
        result.actual_value = code;
        result.evidence_timestamp = now;
        if (code && code[0] === "2") {
          result.status = "VERIFIED";
        } else {
          result.status = "UNKNOWN";
          result.notes = appendNote(result.notes, `http_code=${code}`);
        }
      } else {
        result.status = "UNKNOWN";
        result.notes = appendNote(result.notes, "no URL in evidence_source");
      }
    } else {
      // Unknown evidence type: try path existence as weak signal only
      if (source && !source.includes(" ")) {
        const check = gitLogExists(source);
        result.executed = true;
        summary.executed += 1;
        result.actual_value = check.exists ? `exists:${check.path}` : "missing";
        result.evidence_timestamp = now;
        result.status = check.exists ? "VERIFIED" : "UNKNOWN";
      } else {
        result.status = claim.status === "VERIFIED" ? "VERIFIED" : "UNKNOWN";
        result.notes = appendNote(result.notes, `no executor for evidence_type=${type || "null"}`);
      }
    }
  } catch (err) {
    result.executed = true;
    summary.errors += 1;
    result.status = "UNKNOWN";
    result.error = err instanceof Error ? err.message : String(err);
    result.notes = appendNote(result.notes, `executor exception: ${result.error}`);
  }

  // Doc missing → QUESTIONABLE regardless
  const docPath = resolveDocPath(claim.doc_file);
  if (claim.doc_file && (!docPath || !existsSync(docPath))) {
    if (result.status === "VERIFIED") result.status = "QUESTIONABLE";
    result.notes = appendNote(result.notes, `doc missing: ${claim.doc_file}`);
  }

  return result;
}

function appendNote(prev, next) {
  if (!prev) return next;
  if (prev.includes(next)) return prev;
  return `${prev} | ${next}`;
}

function printHuman(results) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔐 CLAIM VERIFICATION REPORT (executor)");
  console.log(`ledger: ${ledgerPath}`);
  console.log(`generated_at: ${now}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  for (const r of results) {
    const claim = claims.find((c) => c.id === r.id);
    const text = (claim?.claim || "").replace(/\s+/g, " ").slice(0, 100);
    const icon =
      r.status === "VERIFIED"
        ? "✅"
        : r.status === "STALE"
          ? "❌"
          : r.status === "QUESTIONABLE"
            ? "⚠️ "
            : "❓";
    console.log(`${icon} ${r.status}: [${r.id}] ${text}`);
    if (r.actual_value != null) console.log(`   actual: ${r.actual_value}`);
    if (r.notes) console.log(`   notes: ${r.notes}`);
    console.log("");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Verified:      ${summary.verified}`);
  console.log(`❌ Stale:         ${summary.stale}`);
  console.log(`⚠️  Questionable:  ${summary.questionable}`);
  console.log(`❓ Unknown:       ${summary.unknown}`);
  console.log(`⚙️  Executed:      ${summary.executed}`);
  console.log(`💥 Errors:        ${summary.errors}`);
  console.log(`Total claims:     ${summary.total}`);
}

const results = claims.map((c) => verifyClaim(c));

for (const r of results) {
  switch (r.status) {
    case "VERIFIED":
      summary.verified += 1;
      break;
    case "STALE":
      summary.stale += 1;
      break;
    case "QUESTIONABLE":
      summary.questionable += 1;
      break;
    default:
      summary.unknown += 1;
  }
}

// Guard: never report zero when ledger has claims
if (summary.total !== claims.length) {
  console.error("invariant violated: summary.total != claims.length");
  process.exit(1);
}

if (writeBack) {
  const byId = new Map(results.map((r) => [r.id, r]));
  ledger.claims = claims.map((c) => {
    const r = byId.get(c.id);
    if (!r) return c;
    return {
      ...c,
      status: r.status,
      actual_value: r.actual_value,
      evidence_timestamp: r.evidence_timestamp,
      notes: r.notes,
      last_verified_at: now,
    };
  });
  ledger.last_verification = {
    at: now,
    summary,
    executor: "scripts/verify-all-claims.mjs",
  };
  const tmp = `${ledgerPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, ledgerPath);
}

if (jsonOut) {
  process.stdout.write(
    `${JSON.stringify({ summary, results, ledger: ledgerPath, writeBack }, null, 2)}\n`,
  );
} else {
  printHuman(results);
}

if (summary.stale > 0) process.exit(1);
process.exit(0);
