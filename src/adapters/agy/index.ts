import type {
  DecodedEvent,
  DecodedSession,
  SourceAdapter,
  SessionContext,
} from "../../internal.js";
import type { Diagnostic } from "../../types.js";
import { parseJsonLines } from "../shared.js";

export const agyAdapter: SourceAdapter = {
  source: "agy",

  decode(transcript: string): DecodedSession {
    const diagnostics: Diagnostic[] = [];
    const events: DecodedEvent[] = [];
    const rows = [...parseJsonLines(transcript, diagnostics)];

    const context: SessionContext = { source: "agy" };
    let sequenceNum = 0;

    for (const { value: record, line } of rows) {
      if (!record || typeof record !== "object") {
        diagnostics.push({
          code: "timestamps_synthesized",
          message: `Invalid record on line ${line}`,
          inputLine: line,
        });
        continue;
      }

      const recordType = (record as Record<string, unknown>).type;

      // Skip transport-only records
      if (
        recordType === "meta" ||
        recordType === "status" ||
        recordType === "progress" ||
        recordType === "system"
      ) {
        if (recordType === "meta") {
          if ((record as Record<string, unknown>).model) {
            context.model = (record as Record<string, unknown>).model as string;
          }
        }
        continue;
      }

      const timestamp =
        (record as Record<string, unknown>).timestamp instanceof Date
          ? (record as Record<string, unknown>).timestamp as Date
          : (record as Record<string, unknown>).timestamp
            ? new Date((record as Record<string, unknown>).timestamp as string)
            : new Date();

      const role = (record as Record<string, unknown>).role;

      if (role === "user" || role === "assistant") {
        const content = (record as Record<string, unknown>).content as string;
        events.push({
          type: "message",
          role: role as "user" | "assistant",
          content: content || "",
          timestamp,
          inputLine: line,
        });

        // If assistant has tool calls, emit them as separate events
        const tcArray = (record as Record<string, unknown>).tool_calls;
        if (role === "assistant" && Array.isArray(tcArray)) {
          for (const tc of tcArray as any[]) {
            events.push({
              type: "tool_call",
              id: tc.id || `call_${sequenceNum}`,
              name: tc.name || tc.function?.name || "unknown",
              args:
                typeof tc.arguments === "string"
                  ? tc.arguments
                  : typeof tc.function?.arguments === "string"
                    ? tc.function.arguments
                    : JSON.stringify(tc.arguments || tc.function?.arguments || {}),
              timestamp,
              inputLine: line,
            });
          }
        }
      }

      sequenceNum++;
    }

    return {
      events,
      context,
      diagnostics,
    };
  },
};
