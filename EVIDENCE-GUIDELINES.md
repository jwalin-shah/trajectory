# Evidence Guidelines

**Rule: NEVER assert without evidence.**

Every claim must be backed by one of these:

## Evidence Types

### 1. **test_pass** - Automated test result
- What: Test ran and succeeded
- Example: "verify-all-adapters.js passed 6/6"
- Location: Script path, exit code
- ✅ Proves: System works as tested

### 2. **file_exists** - File verification
- What: File exists at specific path
- Example: "~/.claude-token/projects has 3,929 files"
- Location: `ls -la /path`, `find /path`
- ✅ Proves: Data/config exists

### 3. **command_output** - CLI result
- What: Command ran successfully
- Example: "npm build completed without errors"
- Location: Command, exit code, stdout snippet
- ✅ Proves: Build step worked

### 4. **verification_check** - Verification system
- What: `verifyNormalized()` or `verifyEnriched()` passed
- Example: "CT adapter passed 12/12 verification checks"
- Location: Check name, pass count
- ✅ Proves: Data meets schema invariants

### 5. **code_inspection** - Source code review
- What: Read actual code and verified its behavior
- Example: "Line 42 of enricher.ts shows adapter mapping"
- Location: File path, line number
- ✅ Proves: Implementation matches claim

### 6. **sample_result** - Real data tested
- What: Ran operation on real sample data, saw output
- Example: "Processed CA transcript, got 245 normalized records"
- Location: File path, output shown
- ✅ Proves: Works on actual data

### 7. **calculated_aggregate** - Math on verified data
- What: Used verified numbers to calculate derived value
- Example: "7,315 files × 29 avg records/file = 212,135 total"
- Location: Which verified numbers used
- ✅ Proves: Extrapolation is sound

## What's NOT Evidence

❌ "I think..."
❌ "It should work because..."
❌ "Presumably..."
❌ "Typically..."
❌ "Likely..."
❌ "Probably..."

## Pattern: Claim → Evidence → Verify

**Every statement follows this:**

```
CLAIM: "All 6 adapters work end-to-end"

REASONING: Built complete pipeline with normalize + enrich

EVIDENCE:
  1. ✓ verification_check: CT 12/12 checks @ scripts/verify-all-adapters.js
  2. ✓ verification_check: CA 12/12 checks @ scripts/verify-all-adapters.js
  3. ✓ verification_check: PI 12/12 checks @ scripts/verify-all-adapters.js
  4. ✓ verification_check: Codex 11/11 checks @ scripts/verify-all-adapters.js
  5. ✓ verification_check: Cursor 11/11 checks @ scripts/verify-all-adapters.js
  6. ✓ verification_check: Agy 11/11 checks @ scripts/verify-all-adapters.js

VERIFICATION: ✓ CLAIM VERIFIED
```

## When You CAN'T Prove Something

If you make a claim and don't have evidence:

1. **Say so explicitly**: "This is unverified"
2. **Show what's missing**: "Would need: [test run showing X]"
3. **Don't proceed**: Don't use unverified claims to build on

## Examples of Good vs Bad Claims

### Bad (assumed):
> "The processor handles 7,312 transcripts"

### Good (verified):
> "We found 7,315 transcript files (verified by `find` across all adapters).
> We tested sampling 37 real files and normalized them all successfully.
> Average 29 records per file = 212,135 estimated total records.
> Evidence: file_exists (find output), sample_result (normalized output), calculated_aggregate"

---

## Enforcement

- **In code**: Use `ClaimTracker` to register claims, add evidence, verify before use
- **In explanations**: Prefix every major claim with "✓ Evidence:" or "✗ Unverified:"
- **In decisions**: Only base decisions on verified claims
- **In reports**: Run `tracker.auditReport()` to show what's proven vs assumed

## The Spiral Prevention

Without evidence-based reasoning:
```
Assumption A (unproven)
  ↓ builds on
Assumption B (unproven)
  ↓ builds on
Assumption C (unproven)
  ↓ BREAKS - but now it's hard to trace back which assumption was wrong
```

With evidence-based reasoning:
```
Claim A ✓ (verified with tests)
  ↓ builds on
Claim B ✓ (verified with code inspection)
  ↓ builds on
Claim C ✓ (verified with sample results)
  ↓ If breaks: exactly which claim failed and why
```

---

## Quick Reference

| Claim Type | Required Evidence | How to Get It |
|---|---|---|
| "System works" | verification_check | Run verify-all-adapters.js |
| "File exists" | file_exists | `ls -la` or `find` |
| "Build succeeds" | command_output | Run `npm build`, check exit code |
| "Adapters X, Y, Z work" | verification_check × 3 | Run verifyFullPipeline on each |
| "7,312 transcripts found" | file_exists | `find ~/.* -name "*.jsonl" -o -name "*.db"` |
| "Processing complete" | test_pass | Run full pipeline test suite |
| "Code does X" | code_inspection | Read source, show line numbers |

---

**TL;DR**: No claim without proof. If you can't prove it, don't state it as fact.
