import { readFileSync, writeFileSync } from "node:fs";
import { normalizeTranscript } from "./index.js";
import { NormalizationError } from "./types.js";

const PROTOCOL_VERSION = 1;

interface WireRequest {
  version: number;
  requests: unknown[];
}

interface WireError {
  name: string;
  code: string;
  message: string;
}

type WireResult =
  | { ok: true; result: ReturnType<typeof normalizeTranscript> }
  | { ok: false; error: WireError };

function main(): void {
  const request = parseRequest(readFileSync(0, "utf8"));
  const results: WireResult[] = request.requests.map((input) => {
    try {
      return {
        ok: true,
        result: normalizeTranscript(input as Parameters<typeof normalizeTranscript>[0]),
      };
    } catch (error) {
      if (error instanceof NormalizationError) {
        return {
          ok: false,
          error: {
            name: error.name,
            code: error.code,
            message: error.message,
          },
        };
      }
      return {
        ok: false,
        error: {
          name: error instanceof Error ? error.name : "Error",
          code: "internal_error",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  writeFileSync(1, JSON.stringify({ version: PROTOCOL_VERSION, results }));
}

function parseRequest(raw: string): WireRequest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Trajectory bridge input must be valid JSON.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== PROTOCOL_VERSION ||
    !("requests" in value) ||
    !Array.isArray(value.requests)
  ) {
    throw new Error(
      `Trajectory bridge input must contain version ${PROTOCOL_VERSION} and a requests array.`,
    );
  }
  return value as WireRequest;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`trajectory bridge: ${message}\n`);
  process.exitCode = 1;
}
