# Source-version audit

Audit date: 2026-07-11.

This audit asks whether native transcript versions require different decoding
logic. It records aggregate structure only. Transcript prose, tool arguments,
tool results, identifiers, and paths were neither printed nor retained.

## Method

The audit groups transcripts by an embedded producer version, fingerprints
record and content-block shapes, and optionally runs the current normalizer.

```sh
bun run audit:versions claude-code --normalize ~/.claude/projects
bun run audit:versions codex --normalize ~/.codex/sessions
```

The output contains counts and structural signatures only. A signature includes
discriminator values such as record type and content-block type plus sorted key
names; it does not recurse into tool arguments or emit field values.

Harbor was used as a secondary implementation reference. Its Claude Code and
Codex converters extract producer versions and tolerate known structures in a
single rolling converter; they do not publish a source-version compatibility
matrix:

- <https://github.com/harbor-framework/harbor/blob/main/src/harbor/agents/installed/claude_code.py>
- <https://github.com/harbor-framework/harbor/blob/main/src/harbor/agents/installed/codex.py>

## Claude Code

Coverage:

- 1,008 JSONL files and 140,687 records.
- 18 embedded versions from `2.1.139` through `2.1.206`.
- 872 top-level session files and 136 standalone subagent files.
- Two sessions contain records from two producer versions, consistent with a
  session being resumed after Claude Code was upgraded.

The normalized concepts are structurally stable throughout the observed
range:

- Assistant blocks: `text`, `thinking`, and `tool_use`.
- User content: strings, `text` blocks, and `tool_result` blocks.
- Tool-use inputs remain JSON objects.
- Tool-result content remains either text or an array of content blocks.

Later versions add metadata and transport records without changing those core
concepts. Examples include system/compaction records, session-kind metadata,
relocation/worktree state, and an assistant `fallback` block first observed in
`2.1.202`. The current adapter intentionally ignores those records; the
`fallback` block describes a model fallback and contains no assistant prose.

Normalization outcome:

- All 869 complete top-level sessions normalized successfully.
- The other three top-level files were incomplete: two lacked a user turn and
  one lacked an assistant turn.
- The 136 subagent files are not complete standalone trajectories and account
  for the remaining missing-user failures.

Conclusion: the observed Claude Code versions do not justify separate decoder
implementations. Continue using structural decoding. Producer version should
still be extracted because a future structural change may require a branch.
Version-aware decoding must not assume one version per file because resumed
sessions can contain mixed-version records.

## Codex

Coverage:

- 47 JSONL files and 48,616 records.
- 14 embedded CLI versions from `0.101.0` through `0.144.1`.
- Every file contains one `session_meta.payload.cli_version` value.

The main conversation format remains stable:

- Messages use `response_item` with payload type `message`.
- Tool calls/results use `function_call` and `function_call_output`.
- `custom_tool_call` and `custom_tool_call_output` are present from `0.107.0`
  in this corpus.
- `web_search_call` is also present and is supported by the current adapter.

New transport or state events appear over time and can remain ignored. Examples
include patch/command completion events, thread rollback/settings events, MCP
completion events, and top-level `world_state` records.

One decoder gap was found: `0.140.0` contains a paired
`tool_search_call`/`tool_search_output`. The current Codex adapter silently
drops both. This is a new semantic tool event, not merely metadata, and should
be added to the structural decoder with a sanitized fixture.

Normalization outcome:

- All 43 complete sessions normalized successfully.
- Four incomplete files lacked an assistant record.

Conclusion: the observed Codex versions also do not require whole-version
decoders. Add the missing tool-search shape to the existing decoder and keep
dispatch structural unless an incompatible representation is found.

## Letta

The on-device `~/.letta/transcripts` tree is not valid native-version evidence
for the current Letta adapter:

- 39,666 legacy `transcript.json` files contain role-based reflection/context
  records and no producer version.
- 1,923 nested `transcript.jsonl` files are reflection-trigger artifacts and
  likewise contain no producer version.
- None of these files contain the native `message_type` objects consumed by the
  Letta adapter.

These artifacts were fingerprinted to confirm their provenance mismatch, then
excluded from compatibility conclusions. They must not be labeled with the
currently installed Letta Code version because they may predate it.

The previously checked live Letta message response confirms the current
`message_type` representation, but the messages themselves do not embed a
Letta server or client version. Establishing historical Letta compatibility
therefore requires controlled runs against pinned Letta releases or a corpus
whose collection metadata records the producer version.

## Decisions supported by this audit

1. Prefer one tolerant structural decoder per source. Add version branches only
   after observing an incompatible representation.
2. Extract embedded versions automatically: Claude Code top-level `version` and
   Codex `session_meta.payload.cli_version`.
3. Accept a caller-supplied source version for formats such as Letta that do not
   embed one, but do not infer a release from shape alone.
4. Record unknown semantic record and content-block types as diagnostics. Silent
   drops make future format drift difficult to detect.
5. Add sanitized fixtures for each distinct format family, not for every
   producer release.
6. Run a fixed probe task against pinned releases when local corpora lack a
   version or do not exercise messages, reasoning, tool calls/results, errors,
   compaction, and subagents.

## Open questions

- Define provenance for the rare mixed-version Claude session. Decoding can use
  each record's embedded version even if normalized metadata remains singular.
- Decide whether Letta's source version denotes the server release, client/CLI
  release, or a separately versioned transcript export contract. The server
  controls the observed `message_type` response shape, so server version is the
  strongest default when available.
