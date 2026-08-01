import type {
  DecodedEvent,
  DecodedSession,
  SourceAdapter,
  SessionContext,
} from "../../internal.js";
import type { Diagnostic } from "../../types.js";
import { openSqliteReadOnlySync } from "../listing-shared.js";
import { parseTimestamp } from "../shared.js";

export const cursorAdapter: SourceAdapter = {
  source: "cursor",

  decode(input: string): DecodedSession {
    const diagnostics: Diagnostic[] = [];
    const events: DecodedEvent[] = [];
    const contextSource: SessionContext = { source: "cursor" };

    try {
      // input is the path to store.db file
      const db = openSqliteReadOnlySync(input);

      try {
        let messages: Array<{
          id?: string | number;
          content?: string;
          role?: string;
          timestamp?: string | number;
          created_at?: string | number;
          text?: string;
          message?: string;
        }> = [];

        const tables = db.all(
          "SELECT name FROM sqlite_master WHERE type='table'",
        ) as Array<{ name: string }>;
        const tableNames = tables.map((t) => t.name);

        const messageTable = tableNames.find(
          (t) =>
            t.toLowerCase().includes("message") ||
            t.toLowerCase().includes("chat") ||
            t.toLowerCase().includes("conversation"),
        );

        if (messageTable) {
          const schema = db.all(`PRAGMA table_info(${messageTable})`) as Array<{
            name: string;
            type: string;
          }>;
          const columnNames = schema.map((c) => c.name);

          const roleCol = columnNames.find((c) => c.toLowerCase() === "role");
          const contentCol = columnNames.find(
            (c) =>
              c.toLowerCase() === "content" ||
              c.toLowerCase() === "text" ||
              c.toLowerCase() === "message",
          );
          const timestampCol = columnNames.find(
            (c) =>
              c.toLowerCase() === "timestamp" ||
              c.toLowerCase() === "created_at" ||
              c.toLowerCase() === "date",
          );

          if (contentCol && roleCol) {
            const cols = [roleCol, contentCol];
            if (timestampCol) cols.push(timestampCol);
            if (columnNames.includes("id")) cols.unshift("id");

            const query = `SELECT ${cols.join(", ")} FROM ${messageTable} ORDER BY rowid`;
            messages = db.all(query) as typeof messages;
          }
        }

        for (const msg of messages) {
          const role = msg.role;
          const content = msg.content || msg.text || msg.message;
          const ts = parseTimestamp(msg.timestamp || msg.created_at || undefined);

          if (role && content && (role === "user" || role === "assistant")) {
            const event: DecodedEvent = {
              type: "message",
              role,
              content,
              ...(ts ? { timestamp: ts } : {}),
              ...(msg.id !== undefined ? { sourceRecordId: String(msg.id) } : {}),
            };
            events.push(event);
          }
        }

        if (events.length === 0) {
          diagnostics.push({
            code: "timestamps_synthesized",
            message: "No messages found in cursor SQLite database",
          });
        }
      } finally {
        db.close();
      }
    } catch (e) {
      diagnostics.push({
        code: "timestamps_synthesized",
        message: `Failed to decode cursor SQLite: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    return {
      events,
      context: contextSource,
      diagnostics,
    };
  },
};
