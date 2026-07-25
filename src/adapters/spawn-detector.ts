import fs from "fs";
import path from "path";

export interface SpawnInfo {
  spawned: boolean;
  ticketId?: string;
  manifestSessionId?: string;
  worktreePath?: string;
  proofType?: "worktree-match" | "git-reflog" | "none";
}

/**
 * Detect if a transcript is from a bridge spawn or a manual run.
 * Strategy:
 * 1. Check worktree at ~/.local/share/jw/worktrees/{adapter}/{sessionId}
 * 2. If found, read brief.md for ticket, check manifest.json for session-id match
 * 3. If not found, check git for matching session-id in history
 * 4. Otherwise, mark as manual run
 */
export function detectSpawn(
  sessionId: string,
  _adapter: string,
  transcriptPath?: string
): SpawnInfo {
  const HOME = process.env.HOME || "/Users/jwalinshah";
  const worktreeRoot = path.join(HOME, ".local/share/jw/worktrees");

  // Strategy 1: Check for worktree matching session-id
  if (fs.existsSync(worktreeRoot)) {
    const worktrees = fs.readdirSync(worktreeRoot);

    for (const worktree of worktrees) {
      const wtPath = path.join(worktreeRoot, worktree);

      // Check if this worktree's session-id matches
      const manifestPath = path.join(wtPath, ".bridge", "manifest.json");
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

          // If manifest session_id matches transcript session-id
          if (manifest.session_id === sessionId || worktree.includes(sessionId.slice(0, 8))) {
            // Found matching worktree - read ticket from brief
            const briefPath = path.join(wtPath, ".bridge", "brief.md");
            let ticketId: string | undefined = undefined;

            if (fs.existsSync(briefPath)) {
              const brief = fs.readFileSync(briefPath, "utf-8");
              // Extract ticket ID from brief (format: "Ticket: {id}" or similar)
              const ticketMatch = brief.match(/[Tt]icket[:\s]+([A-Z0-9\-]+)/);
              if (ticketMatch) {
                ticketId = ticketMatch[1];
              }
            }

            return {
              spawned: true,
              ticketId,
              manifestSessionId: manifest.session_id,
              worktreePath: wtPath,
              proofType: "worktree-match",
            };
          }
        } catch (e) {
          // Manifest parse failed, continue checking
        }
      }
    }
  }

  // Strategy 2: Check git for session-id in commit history (if transcript path provided)
  if (transcriptPath) {
    try {
      // Would implement: git log --all --grep=sessionId, etc.
      // For now, skip (requires shell execution)
    } catch (e) {
      // Git check failed
    }
  }

  // Strategy 3: No spawn proof found
  return {
    spawned: false,
    proofType: "none",
  };
}

/**
 * Map adapter to provider and default model.
 */
export interface AdapterConfig {
  provider: string;
  defaultModel?: string;
}

export const ADAPTER_CONFIGS: Record<string, AdapterConfig> = {
  // Deployed adapters with active transcripts
  ct: { provider: "tokenrouter", defaultModel: "deepseek-v4-pro" },
  ca: { provider: "anthropic", defaultModel: "claude-opus-4-8" },
  pi: { provider: "anthropic", defaultModel: "claude-opus-4-8" },
  codex: { provider: "codex", defaultModel: "unknown" },
  cursor: { provider: "cursor", defaultModel: "unknown" },

  // Cloud-based (no local store)
  agy: { provider: "agy", defaultModel: "unknown" },

  // Not deployed / unknown status
  cc: { provider: "anthropic", defaultModel: "claude-opus-4-8" },
  cx: { provider: "codex", defaultModel: "unknown" },
  cua: { provider: "cursor", defaultModel: "unknown" },

  // Direct sessions
  "direct-claude-code": { provider: "anthropic", defaultModel: "claude-opus-4-8" },
};

export function getAdapterConfig(adapter: string): AdapterConfig {
  return ADAPTER_CONFIGS[adapter] || { provider: "unknown" };
}
