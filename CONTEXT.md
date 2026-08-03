# Domain context

> Produced / maintained via the `domain-modeling` skill. Required by portfolio universal-pocock-policy (2026-07-30).

## Purpose

Trajectory serves **two roles** in this machine:

1. **Transcript normalization library** (`@letta-ai/trajectory`) — converts agent transcripts from many runtimes (Claude Code, Codex, Cursor, OpenHands, etc.) into one validated, model-ready record format for training, evaluation, and analysis.
2. **Claims audit system** (per AGENTS.md) — extracts claims from project AGENTS.md/CLAUDE.md files, verifies them against live evidence (git, Neo4j, artifacts), identifies documentation gaps, and drives proof-backed gap closure.

## Ubiquitous language

| Term | Meaning |
|---|---|
| Adapter | Per-source decoder under `src/adapters/<source>/` |
| Record | Normalized trajectory entry (meta, user, assistant, tool, reasoning) |
| Diagnostic | Recoverable cleanup report from normalization |
| Claim | Documented assertion in claims-ledger*.json with status |
| Gap | True but undocumented capability in gaps-ledger.json |
| Proof method | Reproducible command/query proving a claim or closing a gap |

## Entities

| Entity | Invariants | Owner |
|---|---|---|
| Trajectory schema | `schema/trajectory-v1.schema.json`; ISO timestamps on conversational records | trajectory |
| Adapter | Focused decoder; common validation in normalization core | trajectory |
| claims-ledger.json | Master claim inventory (VERIFIED/STALE/QUESTIONABLE/UNKNOWN) | trajectory scripts |
| gaps-ledger.json | Prioritized undocumented capabilities (P0/P1/P2) | trajectory scripts |

## Boundaries

- **In scope:** normalizeTranscript API, listTrajectories discovery, per-adapter README contracts, verification scripts
- **Out of scope:** filesystem access inside normalizeTranscript (except Deep Agents checkpoint reader); modifying audited repos during verification
- **Upstream dependencies:** native transcript formats from agent runtimes; Neo4j for axiom-count claims
- **Downstream consumers:** running-machine-foundation trajectory adapter; ML training/eval pipelines; bridge spawn gap-closure workers

## Events / lifecycle

**Normalization:** caller supplies transcript string + source → adapter decode → core validate/link/repair → records + diagnostics.

**Audit:** extract claims → verify with evidence queries → gap analysis → spawn gap-closure tickets → (future) continuous CI re-check.

## Open questions

- Continuous verification phase (weekly drift detection) is design-only
- 45+ claims still queued for verification per 2026-07-25 audit status
