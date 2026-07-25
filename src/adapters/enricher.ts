import type { NormalizeResult } from "../types.js";
import { detectSpawn, getAdapterConfig, type SpawnInfo } from "./spawn-detector.js";

/**
 * Map source/trajectory names to canonical adapter names.
 */
function mapSourceToAdapter(source: string): string {
  const map: Record<string, string> = {
    "claude-code": "ct",
    "claude-code-ca": "ca",
    pi: "pi",
    codex: "codex",
    cursor: "cursor",
    agy: "agy",
  };
  return map[source] || source;
}

export interface EnrichedRecord extends NormalizeResult {
  enrichment: {
    adapter: string;
    provider: string;
    model?: string;
    spawned: boolean;
    ticketId?: string;
    manifestSessionId?: string;
    worktreePath?: string;
    spawnProofType?: "worktree-match" | "git-reflog" | "none";
  };
}

/**
 * Enrich normalized transcript with adapter context: provider, model, spawn status, ticket.
 *
 * Input: normalized trajectory records + adapter name
 * Output: same records + enrichment metadata
 */
export function enrichTranscript(
  normalized: NormalizeResult,
  adapter: string,
  sessionId?: string,
  transcriptPath?: string
): EnrichedRecord {
  // Normalize adapter name: map source to canonical adapter name
  const adapterName = mapSourceToAdapter(adapter);

  // Get adapter config (provider + default model)
  const config = getAdapterConfig(adapterName);

  // Detect spawn status
  const spawnInfo: SpawnInfo = sessionId
    ? detectSpawn(sessionId, adapterName, transcriptPath)
    : { spawned: false, proofType: "none" };

  // Try to extract model from transcript if not using default
  let model = config.defaultModel;
  if (normalized.records && normalized.records.length > 0) {
    // Claude-code records might have model in meta
    const metaRecord = normalized.records.find(r => r.role === "meta");
    if (metaRecord && "model" in metaRecord) {
      model = (metaRecord as any).model || config.defaultModel;
    }
  }

  return {
    ...normalized,
    enrichment: {
      adapter: adapterName,
      provider: config.provider,
      ...(model ? { model } : {}),
      spawned: spawnInfo.spawned,
      ...(spawnInfo.ticketId ? { ticketId: spawnInfo.ticketId } : {}),
      ...(spawnInfo.manifestSessionId ? { manifestSessionId: spawnInfo.manifestSessionId } : {}),
      ...(spawnInfo.worktreePath ? { worktreePath: spawnInfo.worktreePath } : {}),
      ...(spawnInfo.proofType ? { spawnProofType: spawnInfo.proofType } : {}),
    },
  };
}

/**
 * Enrich multiple transcripts in batch.
 */
export function enrichTranscriptBatch(
  items: Array<{
    normalized: NormalizeResult;
    adapter: string;
    sessionId?: string;
    transcriptPath?: string;
  }>
): EnrichedRecord[] {
  return items.map(item =>
    enrichTranscript(item.normalized, item.adapter, item.sessionId, item.transcriptPath)
  );
}
