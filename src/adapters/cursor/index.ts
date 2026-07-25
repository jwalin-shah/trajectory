import type {
  DecodedEvent,
  DecodedSession,
  SourceAdapter,
} from "../../internal.js";
import type { Diagnostic } from "../../types.js";
import { NormalizationError } from "../../types.js";
import Database from "better-sqlite3";

export const cursorAdapter: SourceAdapter = {
  source: "cursor",

  decode(input: string): DecodedSession {
    const diagnostics: Diagnostic[] = [];
    const events: DecodedEvent[] = [];

    let dbPath: string;
    let threadId: string | undefined;

    // Input can be: path/to/store.db or path/to/store.db#threadId
    if (input.includes("#")) {
      [dbPath, threadId] = input.split("#", 2);
    } else {
      dbPath = input;
    }

    try {
      const db = new Database(dbPath, { readonly: true });

      // Get list of threads if threadId not specified
      let threads: string[] = [];
      try {
        const metaStmt = db.prepare("SELECT value FROM meta WHERE key = 'threads'");
        const result = metaStmt.get() as { value: string } | undefined;
        if (result?.value) {
          threads = JSON.parse(result.value);
        }
      } catch (e) {
        diagnostics.push({
          code: "cursor_thread_list_failed",
          message: "Could not read thread list from cursor store",
        });
      }

      if (!threadId && threads.length > 0) {
        threadId = threads[0];
      }

      if (!threadId) {
        throw new NormalizationError(
          "cursor_no_thread_id",
          "No thread ID specified and none found in store"
        );
      }

      // Fetch messages for this thread
      const messagesStmt = db.prepare(
        "SELECT json FROM blobs WHERE id LIKE ? ORDER BY rowid ASC"
      );
      const threadPattern = `${threadId}%`;
      const rows = messagesStmt.all(threadPattern) as { json: string }[];

      // Parse each message blob
      for (const row of rows) {
        try {
          const msg = JSON.parse(row.json);

          // Skip transport-only records
          if (msg.type === "meta" || msg.type === "status" || msg.type === "progress") {
            continue;
          }

          const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString();

          if (msg.role === "user") {
            events.push({
              role: "user",
              content: msg.content || null,
              timestamp,
            });
          } else if (msg.role === "assistant") {
            const toolCalls = [];
            if (Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                toolCalls.push({
                  id: tc.id || `call_${Date.now()}`,
                  name: tc.function?.name || tc.name || "unknown",
                  args: typeof tc.function?.arguments === "string"
                    ? tc.function.arguments
                    : JSON.stringify(tc.function?.arguments || tc.arguments || {}),
                });
              }
            }

            events.push({
              role: "assistant",
              content: msg.content || null,
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
              timestamp,
            });
          } else if (msg.role === "tool") {
            events.push({
              role: "tool",
              tool_call_id: msg.tool_call_id,
              content: msg.content || null,
              timestamp,
            });
          }
        } catch (e) {
          diagnostics.push({
            code: "cursor_message_parse_failed",
            message: `Failed to parse cursor message blob: ${e instanceof Error ? e.message : "unknown error"}`,
          });
        }
      }

      db.close();
    } catch (e) {
      throw new NormalizationError(
        "cursor_decode_failed",
        `Failed to decode cursor transcript: ${e instanceof Error ? e.message : "unknown error"}`
      );
    }

    return {
      sessionId: threadId || "unknown",
      source: "cursor",
      events,
      diagnostics,
    };
  },
};
