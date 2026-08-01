import type {
  DecodedEvent,
  DecodedSession,
  SourceAdapter,
  SessionContext,
} from "../../internal.js";
import type { Diagnostic } from "../../types.js";
import { openSqliteReadOnlySync } from "../listing-shared.js";
import { parseTimestamp } from "../shared.js";

export const agyAdapter: SourceAdapter = {
  source: "agy",

  decode(input: string): DecodedSession {
    const diagnostics: Diagnostic[] = [];
    const events: DecodedEvent[] = [];
    const contextSource: SessionContext = { source: "agy" };

    try {
      // input is the path to a .db file in ~/.gemini/antigravity-cli/conversations/
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
          body?: string;
        }> = [];

        const tables = db.all(
          "SELECT name FROM sqlite_master WHERE type='table'",
        ) as Array<{ name: string }>;
        const tableNames = tables.map((t) => t.name);

        const messageTable = tableNames.find(
          (t) =>
            t.toLowerCase() === "messages" ||
            t.toLowerCase() === "history" ||
            t.toLowerCase() === "conversation" ||
            t.toLowerCase().includes("message"),
        );

        if (messageTable) {
          const schema = db.all(`PRAGMA table_info(${messageTable})`) as Array<{
            name: string;
            type: string;
          }>;
          const columnNames = schema.map((c) => c.name);

          const roleCol = columnNames.find(
            (c) => c.toLowerCase() === "role" || c.toLowerCase() === "author",
          );
          const contentCol = columnNames.find(
            (c) =>
              c.toLowerCase() === "content" ||
              c.toLowerCase() === "text" ||
              c.toLowerCase() === "message" ||
              c.toLowerCase() === "body",
          );
          const timestampCol = columnNames.find(
            (c) =>
              c.toLowerCase() === "timestamp" ||
              c.toLowerCase() === "created_at" ||
              c.toLowerCase() === "date" ||
              c.toLowerCase() === "time",
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
          const content = msg.content || msg.text || msg.message || msg.body;
          const ts = parseTimestamp(msg.timestamp || msg.created_at || undefined);

          if (
            role &&
            content &&
            (role === "user" ||
              role === "assistant" ||
              role === "model" ||
              role === "human")
          ) {
            const normalizedRole =
              role === "model" || role === "assistant" ? "assistant" : "user";
            const event: DecodedEvent = {
              type: "message",
              role: normalizedRole,
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
            message: "No messages found in agy SQLite database",
          });
        }
      } finally {
        db.close();
      }
    } catch (e) {
      diagnostics.push({
        code: "timestamps_synthesized",
        message: `Failed to decode agy SQLite: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    return {
      events,
      context: contextSource,
      diagnostics,
    };
  },
};
