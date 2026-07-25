# agy adapter

Normalizes agy agent transcripts from print-mode output (JSONL format).

## Input format

Capture agy print-mode output and pass it to the adapter:

```bash
agy -p "your prompt here" > transcript.jsonl
```

Or pass the JSONL string directly:

```ts
const { records } = normalizeTranscript({
  source: "agy",
  transcript: rawJsonlString,
});
```

Each line should be a JSON object with:
- `type`: record type (user, assistant, tool, meta, status, etc.)
- `role`: "user", "assistant", or "tool"
- `content`: message text
- `tool_calls`: array of {id, name, arguments}
- `timestamp`: ISO 8601 timestamp

## Schema

The adapter extracts:
- `role`: conversational role ("user", "assistant", "tool")
- `content`: message text or null
- `tool_calls`: array of {id, name, args} for assistant records
- `timestamp`: ISO 8601 timestamp (uses record timestamp or current time)

## What's dropped

- Transport-only records (type: "meta", "status", "progress", "system")
- Tool results without an associated tool call
- Branching/project metadata

## Example

```json
{"type": "user", "role": "user", "content": "Check the directory", "timestamp": "2026-07-25T12:00:00Z"}
{"type": "assistant", "role": "assistant", "content": null, "tool_calls": [{"id": "call_1", "name": "bash", "arguments": "{\"cmd\": \"pwd\"}"}], "timestamp": "2026-07-25T12:00:01Z"}
{"type": "tool", "role": "tool", "tool_call_id": "call_1", "content": "/workspace", "timestamp": "2026-07-25T12:00:02Z"}
```
