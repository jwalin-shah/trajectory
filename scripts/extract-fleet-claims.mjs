#!/usr/bin/env node
/**
 * Extract verifiable claims from fleet documentation files that currently have
 * zero entries in the claims ledger. Links each new claim to a proof_method and
 * zero-or-more axiom ids when keyword overlap is strong.
 *
 * Usage:
 *   node scripts/extract-fleet-claims.mjs [--write] [--json]
 *     [--ledger scripts/claims-ledger.json]
 *     [--roots ~/projects]
 *
 * Default roots: ~/projects only (not ~/firstmate mirrors).
 * Default doc names: AGENTS.md, CONTEXT.md, DESIGN.md
 *   (plus GLOBAL.md under dotfiles; CLAUDE.md only when no AGENTS.md sibling)
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const HOME = homedir();
const PROJECTS = join(HOME, "projects");

const args = process.argv.slice(2);
const writeBack = args.includes("--write");
const jsonOut = args.includes("--json");
const ledgerFlag = argValue("--ledger") || join(REPO_ROOT, "scripts/claims-ledger.json");
const rootsFlag = argValue("--roots");
const roots = (rootsFlag ? rootsFlag.split(",") : [PROJECTS]).map((r) =>
  resolve(expandHome(r.trim())),
);

const PRIMARY_DOC_NAMES = new Set(["AGENTS.md", "CONTEXT.md", "DESIGN.md", "GLOBAL.md"]);
const EXCLUDE_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".treehouse",
  "worktrees",
  "dist",
  "vendor",
  "_archive",
  "fixtures",
  "testdata",
  ".quarantine",
  "experiments",
  "docs", // avoid deep design novels (e.g. mintmux/docs/DESIGN.md) unless top-level
]);

const EXCLUDE_PATH_SUBSTR = [
  "/wayfinder/one-surface-system-2026-07-30/templates/",
  "/macro/apps/",
  "/macro/crates/",
  "/career-ops/modern-resume/",
  "/CodexBar/docs/",
  "/firstmate/projects/",
  "/btw-v1/_archive/",
];

// Empirical / inventory markers — prefer these over pure style guides
const EMPIRICAL_RE =
  /\b(\d{2,}|proven|shipped|implemented|verified|complete|working|live|active|running|exists?|contains?|requires?|supports?|provides?|includes?|passes?|exits?|returns?|pipeline|adapter|ledger|neo4j|axiom|invariant|proof|test|commit|session|normalize|schema)\b/i;

const PRESCRIPTIVE_START =
  /^(never|always|do not|don't|must not|should|shall|prefer|avoid|when you|if you|before you|after you)\b/i;

const FRAGMENT_END = /[,;:]$/;
const FRAGMENT_START = /^(and|or|but|with|for|to|of|in|on|as|the|a|an)\b/i;

function argValue(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1] ?? null;
}

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith("~/")) return join(HOME, p.slice(2));
  if (p.startsWith("~")) return join(HOME, p.slice(1));
  return p;
}

function walkDocs(root, out = [], depth = 0) {
  if (!existsSync(root) || depth > 4) return out;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  const names = new Set(entries.map((e) => e.name));
  for (const ent of entries) {
    const full = join(root, ent.name);
    if (ent.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(ent.name)) continue;
      if (ent.name.startsWith(".")) continue;
      walkDocs(full, out, depth + 1);
    } else if (ent.isFile()) {
      if (EXCLUDE_PATH_SUBSTR.some((s) => full.includes(s))) continue;
      if (PRIMARY_DOC_NAMES.has(ent.name)) {
        out.push(full);
      } else if (ent.name === "CLAUDE.md" && !names.has("AGENTS.md")) {
        // CLAUDE-only projects
        out.push(full);
      }
    }
  }
  return out;
}

function loadAxioms() {
  const path = join(PROJECTS, "axioms/axioms.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Build multi-sentence candidate claims from markdown.
 * Strategy: paragraph blocks → join wrapped lines → split on sentence boundaries.
 */
function splitClaims(text) {
  const withoutCode = text.replace(/```[\s\S]*?```/g, "\n");
  const paragraphs = withoutCode.split(/\n{2,}/);
  const claims = [];

  for (const para of paragraphs) {
    // Skip pure headings / html comments
    const rawLines = para.split("\n").map((l) => l.trimEnd());
    if (rawLines.every((l) => !l.trim() || l.trim().startsWith("#") || l.trim().startsWith("<!--"))) {
      continue;
    }

    // Table rows: each quantitative row is its own claim
    const tableRows = rawLines.filter((l) => /^\|/.test(l.trim()) && !/^\|\s*-+/.test(l.trim()));
    if (tableRows.length >= 1 && tableRows.length === rawLines.filter((l) => l.trim()).length) {
      for (const row of tableRows) {
        const cells = row
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length < 2) continue;
        const statement = cells.join(" — ");
        if (isGoodClaim(statement)) claims.push(collapseWs(statement));
      }
      continue;
    }

    // Join soft-wrapped lines; keep bullet boundaries
    const units = [];
    let buf = "";
    for (const line of rawLines) {
      const t = line.trim();
      if (!t || t.startsWith("#") || t.startsWith("<!--")) continue;
      if (/^[-*+]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
        if (buf) units.push(buf);
        buf = t.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
        continue;
      }
      if (!buf) buf = t;
      else buf = `${buf} ${t}`;
    }
    if (buf) units.push(buf);

    for (const unit of units) {
      const cleaned = collapseWs(
        unit.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, ""),
      );
      // Split into sentences
      const sentences = cleaned
        .split(/(?<=[.!?])\s+(?=[A-Z0-9`"([{])/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (sentences.length === 0) continue;

      // Prefer multi-sentence bundles of 1–3 sentences when short fragments appear
      let i = 0;
      while (i < sentences.length) {
        let bundle = sentences[i];
        let j = i + 1;
        while (
          j < sentences.length &&
          (bundle.length < 80 || !/[.!?]$/.test(bundle)) &&
          bundle.length + sentences[j].length < 420
        ) {
          bundle = `${bundle} ${sentences[j]}`;
          j += 1;
        }
        if (isGoodClaim(bundle)) claims.push(collapseWs(bundle));
        i = Math.max(j, i + 1);
      }
    }
  }

  return [...new Set(claims)];
}

function collapseWs(s) {
  return s.replace(/\s+/g, " ").trim();
}

function isGoodClaim(statement) {
  if (!statement) return false;
  if (statement.length < 60 || statement.length > 480) return false;
  if (FRAGMENT_END.test(statement)) return false;
  if (FRAGMENT_START.test(statement)) return false;
  if (PRESCRIPTIVE_START.test(statement) && !/\b\d{2,}\b/.test(statement)) return false;
  if (!EMPIRICAL_RE.test(statement)) return false;
  // Must look like a finished thought
  const alpha = (statement.match(/[a-zA-Z]/g) || []).length;
  if (alpha < 40) return false;
  // Reject pure link/nav lines
  if (/^see |^related |^notes?:|^todo\b/i.test(statement)) return false;
  return true;
}

function lineOf(text, snippet) {
  const needle = snippet.slice(0, Math.min(60, snippet.length));
  const idx = text.indexOf(needle);
  if (idx === -1) {
    // try first 40 chars of first sentence
    const idx2 = text.indexOf(snippet.slice(0, 40));
    if (idx2 === -1) return null;
    return text.slice(0, idx2).split("\n").length;
  }
  return text.slice(0, idx).split("\n").length;
}

function suggestEvidence(statement, docPath) {
  const lower = statement.toLowerCase();
  if (/\bneo4j\b/.test(lower) || (/\baxioms?\b/.test(lower) && /\b\d{3,}\b/.test(lower))) {
    return {
      evidence_type: "neo4j-query",
      evidence_source: "MATCH (a:Axiom) RETURN count(a)",
      proof_method: "cypher-shell -a neo4j://localhost:7687 'MATCH (a:Axiom) RETURN count(a)'",
    };
  }
  if (/\b(bun run check|typecheck|unit test|test suite)\b/.test(lower)) {
    return {
      evidence_type: "git-commit",
      evidence_source: projectRel(docPath),
      proof_method: "cd $(dirname doc) && (bun run check || npm test || go test ./...)",
    };
  }
  if (/\b(z3|lean|dafny|tla\+|invariant catalog|proof)\b/.test(lower)) {
    const root = guessProjectRoot(docPath);
    return {
      evidence_type: "git-commit",
      evidence_source: join(root, "verification"),
      proof_method: `find ${JSON.stringify(join(root, "verification"))} -type f 2>/dev/null | head`,
    };
  }
  if (/\b(adapter|normalize|transcript|trajectory)\b/.test(lower)) {
    return {
      evidence_type: "git-commit",
      evidence_source: join(PROJECTS, "trajectory/src"),
      proof_method: "ls ~/projects/trajectory/src/adapters && bun test",
    };
  }
  const root = guessProjectRoot(docPath);
  return {
    evidence_type: "git-commit",
    evidence_source: projectRel(docPath) || root,
    proof_method: `test -e ${JSON.stringify(docPath)} && git -C ${JSON.stringify(root)} log -1 --oneline -- ${JSON.stringify(relative(root, docPath) || ".")}`,
  };
}

function projectRel(docPath) {
  if (docPath.startsWith(PROJECTS + "/")) {
    return relative(PROJECTS, docPath).split("/")[0];
  }
  return null;
}

function guessProjectRoot(docPath) {
  let dir = dirname(docPath);
  for (let i = 0; i < 6; i++) {
    if (
      existsSync(join(dir, ".git")) ||
      existsSync(join(dir, "go.mod")) ||
      existsSync(join(dir, "package.json")) ||
      existsSync(join(dir, "pyproject.toml"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(docPath);
}

function linkAxioms(statement, axioms) {
  const words = new Set(
    statement
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 5),
  );
  if (words.size < 3) return [];
  const hits = [];
  for (const ax of axioms) {
    const hay = `${ax.id} ${ax.title || ""} ${ax.category || ""}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (hay.includes(w)) score += 1;
    }
    // title token boost
    if (ax.title) {
      for (const tw of String(ax.title)
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 5)) {
        if (statement.toLowerCase().includes(tw)) score += 2;
      }
    }
    if (score >= 4) {
      hits.push({ id: ax.id, category: ax.category, title: ax.title, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 5).map(({ id, category, title }) => ({ id, category, title }));
}

function claimId(docPath, statement) {
  const h = createHash("sha1").update(`${docPath}::${statement}`).digest("hex").slice(0, 10);
  const base = relative(HOME, docPath)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `fleet-${base}-${h}`;
}

function displayDoc(docPath) {
  if (docPath.startsWith(HOME)) return `~${docPath.slice(HOME.length)}`;
  return docPath;
}

function resolveDocCandidates(docFile) {
  if (!docFile) return [];
  const raw = docFile;
  return [
    resolve(expandHome(raw)),
    resolve(join(HOME, raw.replace(/^~\//, ""))),
    resolve(join(PROJECTS, raw.replace(/^~\/projects\//, "").replace(/^projects\//, ""))),
  ];
}

// --- main ---
const axioms = loadAxioms();
const docs = [];
for (const root of roots) walkDocs(root, docs);

// Always include trajectory self-docs
for (const extra of [
  join(PROJECTS, "trajectory/AGENTS.md"),
  join(PROJECTS, "trajectory/CONTEXT.md"),
  join(PROJECTS, "trajectory/DESIGN.md"),
  join(PROJECTS, "dotfiles/GLOBAL.md"),
]) {
  if (existsSync(extra) && !docs.includes(extra)) docs.push(extra);
}
docs.sort();

const ledgerPath = resolve(ledgerFlag);
const ledger = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, "utf8"))
  : { version: "1.0", claims: [] };
if (!Array.isArray(ledger.claims)) ledger.claims = [];

const existingIds = new Set(ledger.claims.map((c) => c.id));
const existingTexts = new Set(ledger.claims.map((c) => (c.claim || "").trim()));

const coveredResolved = new Set();
for (const c of ledger.claims) {
  for (const cand of resolveDocCandidates(c.doc_file)) {
    try {
      coveredResolved.add(cand);
    } catch {
      /* ignore */
    }
  }
}

const docsWithNoClaims = docs.filter((d) => !coveredResolved.has(resolve(d)));
const newClaims = [];
const perDoc = [];

for (const doc of docsWithNoClaims) {
  let text;
  try {
    text = readFileSync(doc, "utf8");
  } catch {
    continue;
  }
  const statements = splitClaims(text);
  const added = [];
  // Cap per-doc to keep ledger actionable
  for (const statement of statements.slice(0, 40)) {
    if (existingTexts.has(statement)) continue;
    const id = claimId(doc, statement);
    if (existingIds.has(id)) continue;
    const evidence = suggestEvidence(statement, doc);
    const axiom_links = linkAxioms(statement, axioms);
    const line = lineOf(text, statement);
    const entry = {
      id,
      claim: statement,
      doc_file: displayDoc(doc),
      doc_location: line ? `line ${line}` : null,
      evidence_type: evidence.evidence_type,
      evidence_source: evidence.evidence_source,
      proof_method: evidence.proof_method,
      axiom_links,
      evidence_timestamp: null,
      doc_updated: null,
      status: "UNKNOWN",
      actual_value: null,
      notes: `extracted ${new Date().toISOString().slice(0, 10)} by extract-fleet-claims.mjs`,
    };
    newClaims.push(entry);
    added.push(entry.id);
    existingIds.add(id);
    existingTexts.add(statement);
  }
  perDoc.push({
    doc: displayDoc(doc),
    candidates: statements.length,
    extracted: added.length,
    sample_ids: added.slice(0, 3),
  });
}

const report = {
  generated_at: new Date().toISOString(),
  roots,
  docs_scanned: docs.length,
  docs_with_prior_claims: docs.length - docsWithNoClaims.length,
  docs_missing_claims: docsWithNoClaims.length,
  docs_extracted_into: perDoc.filter((d) => d.extracted > 0).length,
  new_claims: newClaims.length,
  axioms_loaded: axioms.length,
  axiom_linked_claims: newClaims.filter((c) => c.axiom_links.length > 0).length,
  docs_missing: perDoc,
  writeBack,
};

if (writeBack && newClaims.length > 0) {
  ledger.claims = [...ledger.claims, ...newClaims];
  ledger.fleet_extraction = {
    at: report.generated_at,
    docs_scanned: report.docs_scanned,
    docs_missing_claims: report.docs_missing_claims,
    docs_extracted_into: report.docs_extracted_into,
    new_claims: report.new_claims,
    axiom_linked_claims: report.axiom_linked_claims,
    extractor: "scripts/extract-fleet-claims.mjs",
  };
  const tmp = `${ledgerPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, ledgerPath);
}

if (jsonOut) {
  process.stdout.write(`${JSON.stringify({ report, newClaims }, null, 2)}\n`);
} else {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📥 FLEET CLAIM EXTRACTION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`docs scanned:            ${report.docs_scanned}`);
  console.log(`docs already covered:    ${report.docs_with_prior_claims}`);
  console.log(`docs missing claims:     ${report.docs_missing_claims}`);
  console.log(`docs extracted into:     ${report.docs_extracted_into}`);
  console.log(`new claims extracted:    ${report.new_claims}`);
  console.log(`claims with axiom links: ${report.axiom_linked_claims}`);
  console.log(`axioms loaded:           ${report.axioms_loaded}`);
  console.log(`write:                   ${writeBack}`);
  console.log("");
  for (const d of perDoc.filter((x) => x.extracted > 0)) {
    console.log(`  +${String(d.extracted).padStart(2)}  ${d.doc}`);
  }
  const empty = perDoc.filter((x) => x.extracted === 0);
  if (empty.length) {
    console.log("");
    console.log(`docs still empty after filters (${empty.length}):`);
    for (const d of empty.slice(0, 30)) console.log(`   0  ${d.doc}`);
  }
  console.log("");
  console.log(`ledger: ${ledgerPath}`);
}

process.exit(0);
