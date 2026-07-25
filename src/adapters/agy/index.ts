import type {
  DecodedEvent,
  DecodedSession,
  SourceAdapter,
} from "../../internal.js";
import type { Diagnostic } from "../../types.js";
import { NormalizationError } from "../../types.js";
import { parseJsonLines } from "../shared.js";

// agy print mode output format (captured from --print flag)
// Each line is a JSON event with type, role, content, tool_calls, etc.

export const agyAdapter: SourceAdapter = {
  source: "agy",

  decode(transcript: string): DecodedSession {
    const diagnostics: Diagnostic[] = [];
    const events: DecodedEvent[] = [];
    const rows = [...parseJsonLines(transcript, diagnostics)];

    let sessionId: string | undefined;

    for (const { value: record, line } of rows) {
      if (!record || typeof record !== "object") {
        diagnostics.push({
          code: "agy_invalid_record",
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
        if (recordType === "meta" && !sessionId) {
          sessionId = (record as Record<string, unknown>).session_id as string | undefined;
        }
        continue;
      }

      const timestamp =
        (record as Record<string, unknown>).timestamp instanceof Date
          ? (record as Record<string, unknown>).timestamp.toISOString()
          : (record as Record<string, unknown>).timestamp
            ? new Date((record as Record<string, unknown>).timestamp as string).toISOString()
            : new Date().toISOString();

      const role = (record as Record<string, unknown>).role;

      if (role === "user") {
        events.push({
          role: "user",
          content: (record as Record<string, unknown>).content as string | null,
          timestamp,
        });
      } else if (role === "assistant") {
        const toolCalls = [];
        const tcArray = (record as Record<string, unknown>).tool_calls;
        if (Array.isArray(tcArray)) {
          for (const tc of tcArray as any[]) {
            toolCalls.push({
              id: tc.id || `call_${Date.now()}`,
              name: tc.name || tc.function?.name || "unknown",
              args:
                typeof tc.arguments === "string"
                  ? tc.arguments
                  : typeof tc.function?.arguments === "string"
                    ? tc.function.arguments
                    : JSON.stringify(tc.arguments || tc.function?.arguments || {}),
            });
          }
        }

        events.push({
          role: "assistant",
          content: (record as Record<string, unknown>).content as string | null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          timestamp,
        });
      } else if (role === "tool") {
        events.push({
          role: "tool",
          tool_call_id: (record as Record<string, unknown>).tool_call_id as string,
          content: (record as Record<string, unknown>).content as string | null,
          timestamp,
        });
      }
    }

    return {
      sessionId: sessionId || "agy-session",
      source: "agy",
      events,
      diagnostics,
    };
  },
};
