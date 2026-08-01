# Gap Closure Ticket Template

Every undocumented capability needs 2 things:
1. **Proof** (evidence it exists)
2. **Documentation** (update AGENTS.md/CLAUDE.md)

## Example: Bridge RRF Fusion (Not Documented)

### Gap Definition
**Project:** bridge  
**Gap:** RRF (Reciprocal Rank Fusion) scoring algorithm not documented in AGENTS.md  
**Evidence Code:** `internal/context/assemble.go:line 142-178`  
**Impact:** P0 (core capability, affects spawn reliability)

### Proof Requirements
Before closing this ticket, answer:

1. **What proof artifact shows this capability exists?**
   ```
   Answer: internal/context/assemble.go has 37 commits mentioning "RRF"
   Verification: git log -p internal/context/assemble.go | grep -i "rrf" | wc -l
   ```

2. **What's the architecture/design?**
   ```
   Answer: RRF combines results from N sources (Neo4j, rg, githits, tldr)
           with weighted scores. See internal/context/fusion.go
   Verification: Read fusion.go, trace through a sample call, document invariants
   ```

3. **What are the constraints/sharp edges?**
   ```
   Answer: RRF score is normalized 0-1. Missing sources don't fail (signal drops).
   Verification: Test with one source down, verify pipeline continues
   ```

### Documentation Requirement
**Update:** `bridge/AGENTS.md` section "## Internal Context Assembly"

**Add text:**
```markdown
- **RRF fusion (internal/context/):** Reciprocal Rank Fusion combines 
  results from Neo4j (chunks+axioms), rg (file search), githits (GitHub history),
  and tldr (summary service). Each result is ranked; scores are normalized 0-1
  and fused via RRF algorithm. Missing sources are skipped (signal level drops
  but pipeline continues). See internal/context/fusion.go for implementation.
  Invariant: ∀result: score ∈ [0, 1]
```

### Acceptance Criteria
- [ ] Proof artifacts identified (code path + line numbers)
- [ ] Proof verified (commands run, output matches claim)
- [ ] Documentation added to AGENTS.md
- [ ] Documentation links to proof artifacts (git paths)
- [ ] Acceptance criteria from proof are added to AGENTS.md as sharp edges
- [ ] claims-ledger updated with NEW claim + VERIFIED status

### Proof Methods (Choose One)

#### Method 1: Code Artifact Tracing
```
1. Locate code file: internal/context/assemble.go
2. Identify function: func (ca *ContextAssembler) FuseResults()
3. Trace invariants: loop condition, score bounds, termination
4. Document: architectural constraints found in trace
5. Verify: run test case, capture output showing invariant holds
```

#### Method 2: Git History Analysis
```
1. git log -p <file> to see design evolution
2. Identify key commits (refactoring, bug fix, feature add)
3. Document: what changed, why, what it means for current behavior
4. Verify: compare current behavior to commit message claims
```

#### Method 3: Live System Query
```
1. Query Neo4j for axiom distribution: MATCH (a:Axiom) RETURN a.category, count(*)
2. Verify results match AGENTS.md claims
3. Document: actual state at audit time
4. Note: this will become stale; set re-check interval
```

#### Method 4: Test Coverage Analysis
```
1. Find tests: grep -r "TestRRF" bridge/
2. Run test with coverage: go test -cover ./internal/context/
3. Document: what invariants are covered, what gaps remain
4. Verify: run tests, capture coverage %, confirm invariants hold
```

---

## Workflow

1. **Gap identified** → Create ticket with proof_method
2. **Ticket spawned** → Worker follows proof method, verifies capability
3. **Proof validated** → Document added to AGENTS.md
4. **Ticket closed** → claims-ledger updated with NEW claim (now VERIFIED)

Result: exponential documentation improvement—every gap closure adds a verified claim.
