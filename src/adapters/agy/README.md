# agy adapter

Normalizes the generated step transcript written by Antigravity CLI.

Antigravity 1.1.7 stores conversation identity in
`~/.gemini/antigravity-cli/conversations/<id>.db`. Its readable generated log
is
`~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`.
The SQLite step payloads are undocumented blobs, so this adapter deliberately
does not reverse-engineer them.

`listTrajectories({ source: "agy" })` lists the `.db` conversations. Pass the
returned database path directly as `transcript`; the adapter resolves and reads
the matching generated log. Tests and callers that already have the log may
also pass its JSONL contents directly.

The step mapping is:

- `USER_EXPLICIT / USER_INPUT` -> user message
- `MODEL / PLANNER_RESPONSE.thinking` -> reasoning
- `MODEL / PLANNER_RESPONSE.content` -> assistant message
- `MODEL / PLANNER_RESPONSE.tool_calls` -> tool calls
- subsequent typed model steps (`RUN_COMMAND`, `CODE_ACTION`, etc.) -> tool results
- system, checkpoint, conversation-history, and ephemeral steps -> dropped

`step_index` is the source-native record identity and ordering key. Tool-call
IDs are deterministically derived from the step index and call position.

This mapping is intentionally bounded to the generated log schema observed in
the installed CLI. An upstream change that removes the generated log or its
typed fields must fail visibly rather than falling back to guessed SQLite
decoding.
