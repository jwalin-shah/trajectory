import type { NormalizeResult } from "../types.js";
import { detectSpawn, getAdapterConfig, type SpawnInfo } from "./spawn-detector.js";

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
  // Get adapter config (provider + default model)
  const config = getAdapterConfig(adapter);

  // Detect spawn status
  const spawnInfo: SpawnInfo = sessionId
    ? detectSpawn(sessionId, adapter, transcriptPath)
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
      adapter,
      provider: config.provider,
      model: model || undefined,
      spawned: spawnInfo.spawned,
      ticketId: spawnInfo.ticketId || undefined,
      manifestSessionId: spawnInfo.manifestSessionId || undefined,
      worktreePath: spawnInfo.worktreePath || undefined,
      spawnProofType: spawnInfo.proofType || undefined,
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
