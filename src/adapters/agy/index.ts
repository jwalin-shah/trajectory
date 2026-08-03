import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type {
  DecodedEvent,
  DecodedSession,
  SourceAdapter,
} from "../../internal.js";
import type { Diagnostic } from "../../types.js";
import { NormalizationError } from "../../types.js";
import {
  isObject,
  jsonString,
  parseJsonLines,
  parseTimestamp,
} from "../shared.js";

interface PendingCall {
  id: string;
  resultType?: string;
}

export const agyAdapter: SourceAdapter = {
  source: "agy",

  decode(input: string): DecodedSession {
    const diagnostics: Diagnostic[] = [];
    const events: DecodedEvent[] = [];
    const loaded = loadInput(input);
    const pending: PendingCall[] = [];
    let createdAt: Date | undefined;

    for (const { value: step, line, byteOffset } of parseJsonLines(
      loaded.transcript,
      diagnostics,
    )) {
      const stepIndex = finiteInteger(step.step_index);
      const timestamp = parseTimestamp(step.created_at);
      createdAt ??= timestamp;
      const sourceRecordId = stepIndex !== undefined ? String(stepIndex) : undefined;
      let componentIndex = 0;
      const emit = (event: DecodedEvent): void => {
        events.push({
          ...event,
          inputLine: line,
          ...(stepIndex !== undefined
            ? { sourceRecordId: String(stepIndex), sourceSequence: stepIndex }
            : { sourceOffset: byteOffset, sourceAnchorKind: "byte" as const }),
          componentIndex: componentIndex++,
          ...(timestamp ? { timestamp } : {}),
        });
      };

      if (step.source === "USER_EXPLICIT" && step.type === "USER_INPUT") {
        if (typeof step.content === "string" && step.content) {
          emit({ type: "message", role: "user", content: step.content });
        }
        continue;
      }

      if (step.source !== "MODEL") continue;

      if (step.type === "PLANNER_RESPONSE") {
        if (typeof step.thinking === "string" && step.thinking) {
          emit({ type: "reasoning", content: step.thinking });
        }
        if (typeof step.content === "string" && step.content) {
          emit({ type: "message", role: "assistant", content: step.content });
        }
        if (!Array.isArray(step.tool_calls)) continue;
        for (let callIndex = 0; callIndex < step.tool_calls.length; callIndex += 1) {
          const call = step.tool_calls[callIndex];
          if (!isObject(call)) continue;
          const name = typeof call.name === "string" && call.name ? call.name : undefined;
          const id = `agy-${sourceRecordId ?? `line-${line}`}-call-${callIndex + 1}`;
          const resultType = resultTypeForTool(name);
          pending.push({ id, ...(resultType ? { resultType } : {}) });
          emit({
            type: "tool_call",
            id,
            ...(name ? { name } : {}),
            args: jsonString(call.args),
          });
        }
        continue;
      }

      const content = stepContent(step);
      if (content === undefined) continue;
      const exactIndex = pending.findIndex((call) => call.resultType === step.type);
      const unknownIndex = pending.findIndex((call) => !call.resultType);
      const matchIndex = exactIndex >= 0 ? exactIndex : unknownIndex;
      const matched = matchIndex >= 0 ? pending.splice(matchIndex, 1)[0] : undefined;
      emit({
        type: "tool_result",
        ...(matched ? { callId: matched.id } : {}),
        content,
      });
    }

    return {
      events,
      context: {
        source: "agy",
        ...(loaded.groupId ? { sourceGroupId: loaded.groupId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      diagnostics,
    };
  },
};

function loadInput(input: string): { transcript: string; groupId?: string } {
  if (!existsSync(input)) return { transcript: input };
  if (extname(input) !== ".db") {
    return { transcript: readFileSync(input, "utf8") };
  }

  const groupId = basename(input, ".db");
  const storeRoot = dirname(dirname(input));
  const transcriptPath = join(
    storeRoot,
    "brain",
    groupId,
    ".system_generated",
    "logs",
    "transcript.jsonl",
  );
  if (!existsSync(transcriptPath)) {
    throw new NormalizationError(
      "invalid_input",
      `Agy conversation ${groupId} has no generated transcript log.`,
    );
  }
  return { transcript: readFileSync(transcriptPath, "utf8"), groupId };
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function stepContent(step: Record<string, unknown>): string | undefined {
  if (typeof step.content === "string") return step.content;
  if (step.content !== undefined) return jsonString(step.content);
  if (typeof step.error === "string") return step.error;
  return undefined;
}

function resultTypeForTool(name: string | undefined): string | undefined {
  switch (name?.toLowerCase()) {
    case "run_command":
    case "running_command":
      return "RUN_COMMAND";
    case "view_file":
      return "VIEW_FILE";
    case "grep_search":
      return "GREP_SEARCH";
    case "list_dir":
      return "LIST_DIRECTORY";
    case "write_to_file":
    case "replace_file_content":
    case "multi_replace_file_content":
      return "CODE_ACTION";
    case "invoke_subagent":
      return "INVOKE_SUBAGENT";
    case "send_message":
    case "manage_task":
      return "GENERIC";
    case "search_web":
      return "SEARCH_WEB";
    case "read_url_content":
      return "READ_URL_CONTENT";
    default:
      return undefined;
  }
}
