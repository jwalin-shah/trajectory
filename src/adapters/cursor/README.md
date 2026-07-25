# cursor-agent adapter

Normalizes cursor-agent session transcripts from the native SQLite store format.

## Input format

Cursor stores sessions in SQLite at `~/.cursor/chats/{project_id}/{session_uuid}/store.db`.

Pass the path to `store.db`, optionally with thread ID:
```ts
const { records } = normalizeTranscript({
  source: "cursor",
  transcript: "/Users/you/.cursor/chats/project-id/session-uuid/store.db#thread-id",
});
```

If no thread ID is specified, the adapter uses the first available thread.

## Schema

Cursor messages are stored as JSON blobs in the `blobs` table. The adapter extracts:
- `role`: "user", "assistant", "tool"
- `content`: message text
- `tool_calls`: array of {id, name, arguments}
- `timestamp`: ISO 8601 timestamp

## What's dropped

- Meta records (type: "meta", "status", "progress")
- Tool call results without associated requests
- Sidechain/branching information (only primary thread is normalized)

## Dependencies

Requires `better-sqlite3` package for SQLite access.
