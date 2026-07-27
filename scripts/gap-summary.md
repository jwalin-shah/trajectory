# Documentation Gap Analysis

**Date:** 2026-07-25  
**Scope:** All 5 projects (bridge, axioms, orbit, portfolio, trajectory)  
**Total gaps found:** 15  
**Actionable P0 gaps:** 9

---

## Summary by Project

| Project | Code Artifacts | Documented | Gaps | P0 | P1 | P2 |
|---------|---|---|---|---|---|---|
| **bridge** | 32 packages | 8 docs | 5 | 3 | 2 | 0 |
| **axioms** | 1 data file | 8 docs | 3 | 2 | 1 | 0 |
| **orbit** | 15 binaries | 3 docs | 3 | 3 | 0 | 0 |
| **portfolio** | 10 maps | 5 docs | 2 | 0 | 1 | 1 |
| **trajectory** | 10 scripts | 1 doc | 2 | 1 | 1 | 0 |

---

## Critical P0 Gaps (Must Document)

### Bridge (3 gaps)
1. **RRF Fusion Algorithm** — internal/create/assemble.go implements scoring but AGENTS.md doesn't explain it
   - Evidence: Code exists, git log shows iterative development
   - Impact: Users can't understand how context is ranked

2. **Context Fan-Out** — internal/context/* implements parallel Neo4j/rg/tldr/githits fetch
   - Evidence: AGENTS.md mentions it (line 32-34) but no detail
   - Impact: Architecture not understood; hard to modify

3. **Manifest Evidence Chain** — internal/manifest defines Assertion/WorkerManifest/VerifiedClaim types
   - Evidence: Struct definitions + type system
   - Impact: Verifier contract unclear

### Axioms (2 gaps)
1. **axioms.json Filtering** — Structure, validation, category distribution not documented
   - Evidence: 2231 axioms in Neo4j, categories (Saltzer-Schroeder, software-correctness, etc.)
   - Impact: Can't query axioms effectively; filtering logic opaque

2. **Bridge-Orbit Audit Workflow** — 117 axiom filtering, 17 categories, findings #7-#9
   - Evidence: bridge/AGENTS.md references audit but methodology not in axioms docs
   - Impact: Audit process not reproducible

### Orbit (3 gaps)
1. **15+ cmd/* Tools** — ast-extract, codebase-graph, dispatch, verify-v3 not documented
   - Evidence: ls orbit/cmd/ shows 15 binaries
   - Impact: User doesn't know what tools exist

2. **Grind Pipeline** — Verification pipeline not in AGENTS.md
   - Evidence: internal/grind*.go implementation
   - Impact: Hard to extend or debug

3. **Tokenrouter Invariants** — RequestBuckets[k][t] ≤ RPM/60, cooldown, lazy expiry
   - Evidence: CLAUDE.md mentions; code has TestAX* gates
   - Impact: Invariants not formally stated

### Trajectory (1 gap)
1. **Transcript Normalization Pipeline** — enrich-all.js + load-to-neo4j.js workflow
   - Evidence: Scripts exist but workflow not documented
   - Impact: Can't onboard new transcript sources

---

## Gap Closure Strategy

**Phase 1 (P0 — Critical):**
- Spawn 9 tickets (one per P0 gap)
- Each ticket: extract proof artifacts + write docs + update AGENTS.md
- Timeline: 1 week

**Phase 2 (P1 — Important):**
- Spawn 5 tickets for P1 gaps after P0 complete
- Timeline: 1 week

**Phase 3 (P2 — Nice-to-Have):**
- 1 ticket (portfolio registry format decision)
- Timeline: 2 weeks

---

## Example: Bridge RRF Gap Closure Ticket

**Gap:** RRF (Reciprocal Rank Fusion) algorithm not documented  
**Proof method:** Code review + git history  
**Ticket scope:**
1. Read internal/create/assemble.go lines X-Y (RRF scoring function)
2. Extract: what is RRF? how are scores computed? why this algorithm?
3. Write: 1-2 paragraph explanation + pseudocode
4. Update: bridge/AGENTS.md with RRF section
5. Proof: git commit message explains RRF design decision

---

**Status:** Ready to spawn 9 P0 gap-closure tickets + verification tickets.

