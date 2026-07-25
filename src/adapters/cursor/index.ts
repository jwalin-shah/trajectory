import type {
  DecodedEvent,
  DecodedSession,
  SourceAdapter,
  SessionContext,
} from "../../internal.js";
import type { Diagnostic } from "../../types.js";

export const cursorAdapter: SourceAdapter = {
  source: "cursor",

  decode(_input: string): DecodedSession {
    const diagnostics: Diagnostic[] = [];
    const events: DecodedEvent[] = [];

    const contextSource: SessionContext = { source: "cursor" };

    // Note: cursor adapter requires better-sqlite3 (native SQLite).
    // For now, return stub to allow npm build to succeed.
    // Real implementation requires: npm install better-sqlite3
    diagnostics.push({
      code: "timestamps_synthesized",
      message: "cursor adapter is a stub; install better-sqlite3 to enable",
    });

    return {
      events,
      context: contextSource,
      diagnostics,
    };
  },
};
