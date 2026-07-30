# Documentation Verification System

**Verify every claim in documentation against objective evidence — NO LLM REASONING.**

## Quick Start

```bash
# 1. Run full audit
bash scripts/verify-all-claims.sh scripts/claims-ledger.json

# 2. Add a claim to audit
jq '.claims += [{
  "id": "new-claim-id",
  "claim": "what docs say",
  "doc_file": "path/to/file",
  "evidence_type": "git-commit|neo4j-query|filesystem-count|transcript-sessions",
  "evidence_source": "the query or git path",
  "status": "UNKNOWN"
}]' scripts/claims-ledger.json > /tmp/ledger.json && mv /tmp/ledger.json scripts/claims-ledger.json

# 3. Query evidence (if transcript-based)
node scripts/find-evidence.js "search pattern" 100
```

## How It Works

### The Claim

A claim is a factual statement in documentation that can be verified objectively:

```
"Axioms in Neo4j: 1196"  ← VERIFIABLE (query Neo4j)
"Sandbox deny-default is active"  ← VERIFIABLE (check running system or transcripts)
"M4 create pipeline proven end-to-end"  ← VERIFIABLE (check git, tests, transcripts)
```

### The Evidence Source

Every claim must have an evidence source — where the truth lives:

| Evidence Type | Example Source | Command/Query |
|---|---|---|
| `neo4j-query` | "Count axioms" | `MATCH (a:Axiom) RETURN count(a)` |
| `git-commit` | "Check if file exists" | `git log --oneline -- path/to/file` |
| `git-blame` | "When was line added" | `git blame -L<line>,<line> file.md` |
| `filesystem-count` | "How many JSONL files" | `find ~/.claude-token/projects -name '*.jsonl' \| wc -l` |
| `transcript-sessions` | "Evidence of work" | `find-evidence.js "pattern" 100` |
| `running-system` | "Is service up" | `curl -s http://localhost:7474/...` |

### The Verification

**Objective. No LLM. Just timestamps.**

```bash
verify-doc-staleness.sh <doc-file> <evidence-source>
```

This compares:
- **doc_mtime**: When documentation was last changed (git ls-files)
- **evidence_timestamp**: When the actual thing was last done (git log, Neo4j record, etc.)

Result:
- ✅ **FRESH**: doc was updated within hours of the evidence
- ❌ **STALE**: evidence is newer than doc (docs haven't been updated)
- ⚠️ **QUESTIONABLE**: doc conflicts with other authoritative sources

## The Claims Ledger

`claims-ledger.json` is the master record of all claims to verify.

### Format

```json
{
  "version": "1.0",
  "claims": [
    {
      "id": "unique-id",
      "claim": "exact text from documentation",
      "doc_file": "path/to/AGENTS.md",
      "doc_location": "line 42 or 'line 40-45'",
      "evidence_type": "neo4j-query|git-commit|filesystem-count|transcript-sessions",
      "evidence_source": "MATCH (a:Axiom)... OR bridge/internal/spawn/release.go",
      "evidence_timestamp": null,
      "doc_updated": null,
      "status": "UNKNOWN|VERIFIED|STALE|QUESTIONABLE",
      "actual_value": null,
      "notes": "why this matters or gotchas"
    }
  ]
}
```

### Status Values

| Status | Meaning | Action |
|---|---|---|
| `UNKNOWN` | Evidence source defined, not yet checked | Run the verification command |
| `VERIFIED` | Evidence found, doc is current | Keep monitoring |
| `STALE` | Evidence is newer than doc | Update doc immediately |
| `QUESTIONABLE` | Conflicts with other authoritative source | Investigate, then update |

## Extraction Workflow

### Step 1: Find claims in a doc

Look for statements like:
- "is shipped", "is implemented", "is verified", "is complete"
- "proven", "working", "live", "active", "running"
- Quantitative: "X axioms", "Y sessions", "N commits"

Example from bridge/AGENTS.md line 1-3:
```
M4: create pipeline (brain dump → ticket) proven end-to-end with language
detection, scaffold injection, atomization, and a CreationAttempt ledger.
```

### Step 2: Add to claims-ledger.json

```json
{
  "id": "bridge-m4-proven-end-to-end",
  "claim": "M4 create pipeline proven end-to-end with language detection, scaffold injection, atomization",
  "doc_file": "projects/bridge/AGENTS.md",
  "doc_location": "line 1-3",
  "evidence_type": "git-commit",
  "evidence_source": "bridge/internal/create/",
  "status": "UNKNOWN",
  "notes": "Check: pipeline tests pass? Invariants verified? No open issues?"
}
```

### Step 3: Verify

For git-based evidence:
```bash
bash scripts/verify-doc-staleness.sh ~/projects/bridge/AGENTS.md "git-log:bridge/internal/create"
```

For Neo4j queries:
```bash
: "${NEO4J_PASSWORD:?NEO4J_PASSWORD is required; refusing an implicit credential}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
curl -s --config <(printf 'user = "%s:%s"\n' "$NEO4J_USER" "$NEO4J_PASSWORD") \
  http://localhost:7474/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH (a:Axiom) RETURN count(a)"}]}'
```

For transcript evidence:
```bash
node scripts/find-evidence.js "sandbox deny-default" 100
```

### Step 4: Update status

Set `status` to `VERIFIED`, `STALE`, or `QUESTIONABLE` based on findings.
If `STALE`, also set `actual_value` to the correct fact.

### Step 5: Report

```bash
bash scripts/verify-all-claims.sh scripts/claims-ledger.json
```

Output shows:
- ✅ VERIFIED claims (keep current)
- ❌ STALE claims (need doc updates)
- ⚠️ QUESTIONABLE claims (need investigation)
- ❓ UNKNOWN claims (not yet verified)

## Examples

### Example 1: Verify axiom count

**Claim:** "1196 axioms in Neo4j" (from bridge/AGENTS.md line 296)

**Verification:**
```bash
: "${NEO4J_PASSWORD:?NEO4J_PASSWORD is required; refusing an implicit credential}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
curl -s --config <(printf 'user = "%s:%s"\n' "$NEO4J_USER" "$NEO4J_PASSWORD") \
  http://localhost:7474/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH (a:Axiom) RETURN count(a)"}]}' | jq '.results[0].data[0].row[0]'
```

**Result:** 2231 (not 1196)

**Action:** Add to ledger with `status: "STALE"` and `actual_value: 2231`

### Example 2: Verify delivery proof implementation

**Claim:** "bridge release requires LandedWorkProof" (from bridge/AGENTS.md line 92-98)

**Verification:**
```bash
grep -r "LandedWorkProof" /Users/jwalinshah/projects/bridge/internal/spawn/
```

**Result:** Found in release.go, manifest types — code implements it

**Action:** 
- Get timestamp: `git log --format=%ct -1 -- bridge/internal/spawn/release.go`
- Get doc timestamp: `git ls-files -s bridge/AGENTS.md | awk '{print $4}'`
- Compare with `verify-doc-staleness.sh`

### Example 3: Verify via transcripts

**Claim:** "Sandbox deny-default is active and working" (claimed in multiple docs)

**Verification:**
```bash
node scripts/find-evidence.js "deny-default" 100
```

**Result:** Found in 2 sessions where file writes were blocked

**Action:** Status `VERIFIED`, confidence 2/100 sessions

## Automated Pipeline

To run daily:

```bash
# In .github/workflows/ or as a cron job
#!/bin/bash
cd /Users/jwalinshah/projects/trajectory
bash scripts/verify-all-claims.sh scripts/claims-ledger.json > /tmp/audit-$(date +%Y-%m-%d).txt

# Flag if any STALE claims
if grep "^❌ STALE" /tmp/audit-*.txt > /dev/null; then
  echo "STALE CLAIMS FOUND" && exit 1
fi
```

## Scope & Ownership

| Area | Owner | Method |
|---|---|---|
| Bridge claims | bridge team | git log + transcript evidence |
| Portfolio claims | portfolio team | git log + maps |
| Axioms claims | axioms maintainer | Neo4j queries |
| Per-project claims | each project | git log for that repo |

## See Also

- **claims-ledger.json** — Master list of all claims being tracked
- **verify-all-claims.sh** — Run full audit
- **verify-doc-staleness.sh** — Check one claim's staleness
- **find-evidence.js** — Search transcripts for evidence
- **query-template.sh** — Reusable Neo4j queries

---

**Questions?** Check the Wayfinder map at `portfolio/wayfinder/comprehensive-documentation-audit-2026-07-25/map.md`
