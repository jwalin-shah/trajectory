# trajectory

Documentation verification and claims audit system. Extracts claims from project AGENTS.md/CLAUDE.md files, verifies them against live evidence (git history, Neo4j, code artifacts), identifies gaps in documentation, and generates proof-backed tickets to close gaps.

Comprehensive audit launched 2026-07-25. Goals: 100% documentation proof coverage, exponential improvement from 18% → 80%+ verified claims.

## Stack

- Node.js + bash scripts for claim extraction and verification
- Neo4j queries for axiom corpus validation
- Git history tracing for proof artifact discovery
- Bridge spawn for parallel verification workers
- claims-ledger.json as source of truth for claim status

## Key Components

### scripts/

- **claims-ledger.json** — Master ledger of extracted claims with status (VERIFIED/STALE/QUESTIONABLE/UNKNOWN)
- **claims-ledger-refined.json** — v2.0 refined ledger using multi-sentence boundaries (55 claims, 18% verified)
- **gaps-ledger.json** — Identified undocumented capabilities (15 gaps: 9 P0, 5 P1, 1 P2)
- **verify-all-claims.sh** — Bash runner: for each claim, execute evidence query, update status
- **find-evidence.js** — Search transcripts for evidence patterns, return matching sessions with confidence
- **VERIFICATION_SYSTEM.md** — Complete documentation of verification framework, extraction workflow, evidence types

### Verification System

**Extraction Phase:** Read 5 documentation sources (bridge/AGENTS.md, axioms/AGENTS.md, orbit/AGENTS.md, portfolio/AGENTS.md, ~/.claude-a/CLAUDE.md). Extract complete, multi-sentence claims. Link each to evidence source.

**Verification Phase:** For each claim, execute evidence query (git log, Neo4j query, transcript search, filesystem count). Compare actual result to claim. Mark VERIFIED, STALE, or QUESTIONABLE.

**Gap Analysis Phase:** Inventory code artifacts (Go files, scripts, configs). Compare to documented capabilities. Find gaps (true but undocumented). Generate proof_method for each gap.

**Gap Closure Phase:** Create spawn tickets with proof requirement + doc requirement. Workers trace artifacts, generate proofs, update AGENTS.md files. Each closure adds new VERIFIED claim.

**Continuous Verification Phase (future):** CI/CD wire-up. Re-check claims weekly. Detect documentation drift.

## Proof Standards

Every claim (existing or new) requires:

1. **Evidence source** — file path, command, or query that proves the claim
2. **Proof method** — how to execute the evidence source (git log, jq query, code review, etc.)
3. **Status** — VERIFIED (matches reality), STALE (outdated), QUESTIONABLE (conflicts found), UNKNOWN (unverified)

Example (VERIFIED):
```
Claim: "2231 axioms in Neo4j"
Evidence: Neo4j query MATCH (a:Axiom) RETURN count(a)
Result: 2231 (exact match)
Status: VERIFIED ✅
```

Example (STALE, FIXED):
```
Claim: "1196 axioms in Neo4j"
Evidence: Same query
Result: 2231 (mismatch)
Status: STALE → Fixed in bridge/AGENTS.md:198, orbit/AGENTS.md:189
```

## Current Audit Status (2026-07-25)

**Phase 1 (Verification): In Progress**
- 55 refined claims extracted (from 81 fragments)
- 8 verified (bridge M4, M3, invariants, axioms categories, Neo4j)
- 2 stale (axiom count, FIXED)
- 45 queued for verification via spawn tickets (101-104, 001-009)

**Phase 2 (Gap Analysis): Complete**
- 15 gaps identified across all projects
- 9 P0 (critical): context assembly, RRF scoring, manifest types, axioms filtering, audit workflow, orbit tools, grind pipeline, tokenrouter invariants, transcript pipeline
- 5 P1 (important): worktree isolation, gopter checkers, axiom ingest, wayfinder maps, trajectory scripts
- 1 P2 (nice to have): portfolio registry format

**Phase 3 (Gap Closure): Spawned**
- 9 P0 gap-closure tickets created with proof requirements
- Workers reading code artifacts, generating proofs, updating AGENTS.md

**Phase 4 (Continuous Verification): Design Phase**
- CI/CD integration: weekly re-check of all claims
- Automated detection of documentation drift
- Stale claim alerts

## Conventions

- All claims in claims-ledger*.json must have status != UNKNOWN before audit is complete
- Each gap must have proof_method defined before gap-closure ticket is accepted
- Bridge spawn tickets use tensor_equation + proof_method as acceptance criteria
- Evidence sources are reproducible commands/queries, not human judgments
- STALE claims trigger AGENTS.md updates (doc fixes, not workarounds)

## Agent Skills

### Issue tracker
GitHub Issues for `jwalinshah/trajectory`. See `docs/agents/issue-tracker.md`.

### Triage labels
Default label vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs
Single-context: AGENTS.md + VERIFICATION_SYSTEM.md + GAP_CLOSURE_TEMPLATE.md. See `docs/agents/domain.md`.

### Mandatory Pre-Task Skills

Before working on verification or gap-closure tickets, read:
- `GAP_CLOSURE_TEMPLATE.md` — proof method patterns and documentation requirements
- `VERIFICATION_SYSTEM.md` — extraction and verification procedures
- `claims-ledger-refined.json` — current claim inventory and status
