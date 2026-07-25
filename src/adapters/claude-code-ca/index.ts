/**
 * Claude.ai (claude-code via Anthropic) adapter
 * Same JSONL format as ct (TokenRouter) but without noise filtering
 */
import { claudeCodeAdapter } from "../claude-code/index.js";
import type { DecodedSession, SourceAdapter } from "../../internal.js";

export const claudeCodeCaAdapter: SourceAdapter = {
  source: "claude-code-ca",

  decode(transcript: string): DecodedSession {
    return claudeCodeAdapter.decode(transcript);
  },
};
