# Design

> Produced / maintained via the `codebase-design` skill. Required by portfolio universal-pocock-policy (2026-07-30).

## Module map

| Module | Responsibility | May depend on |
|---|---|---|
| `src/core.ts`, `src/canonical.ts` | Shared validation, linking, repair, timestamps | src/types |
| `src/adapters/<source>/` | Per-runtime decoders (claude-code, codex, cursor, …) | adapters/shared |
| `src/listing.ts` | listTrajectories discovery with cursor pagination | adapter list helpers |
| `src/validate.ts`, `src/bounds.ts` | Runtime + schema validation, size bounds | schema JSON |
| `src/claims.ts`, `src/verify.ts` | Claims extraction and verification (audit role) | scripts ledgers |
| `python/src/trajectory/` | Python wheel with embedded JS bundle | Bun build output |
| `scripts/` | claims-ledger, verify-all-claims.sh, find-evidence.js | git, Neo4j, jq |

## Dependency rules

- Allowed directions: adapters → shared/core; public API → core only; audit scripts → read external repos
- Forbidden: adapter-specific logic in core; normalizeTranscript touching filesystem (except deepagents checkpoint); human judgment as evidence source

## Interfaces / seams

- **Public API:** `normalizeTranscript(input)` → `{ records, diagnostics }`
- **Discovery:** `listTrajectories({ source, limit, cursor })` — filesystem enumeration only here
- **Schema:** `schema/trajectory-v1.schema.json` + runtime validation
- **Python parity:** `PYTHONPATH=python/src python3 -m unittest discover -s python/tests -v`
- **Audit docs:** `VERIFICATION_SYSTEM.md`, `GAP_CLOSURE_TEMPLATE.md`, `claims-ledger-refined.json`

## Test strategy

- `bun run check` — typecheck, full test suite, build; regenerates embedded JS bundle
- `PARITY.md` — compatibility against real transcript corpora
- `SOURCE_VERSION_AUDIT.md` — privacy-safe format inventory and decoder gaps
- Audit: each claim needs evidence source + proof method; STALE triggers AGENTS.md fixes

## Migration notes

- Deep Agents is the only adapter that reads local LangGraph SQLite by threadId
- Published npm package `@letta-ai/trajectory`; Python wheel ships vendored CLI bundle
- Dual role: keep normalization API boundary separate from claims-audit scripts (transcript-only API per add-source prompt)
