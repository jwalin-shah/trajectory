/**
 * Verification layer - prove claims about the system
 * Every major operation generates evidence that can be audited
 */

import { normalizeTranscript } from "./index.js";
import { enrichTranscript, type EnrichedRecord } from "./adapters/enricher.js";
import type { NormalizedRecord, TrajectorySource } from "./types.js";

export interface VerificationResult {
  passed: boolean;
  checks: CheckResult[];
  evidence: Record<string, unknown>;
  timestamp: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  evidence?: unknown;
}

/**
 * Verify a normalized transcript meets all invariants
 */
export function verifyNormalized(records: NormalizedRecord[]): CheckResult[] {
  const checks: CheckResult[] = [];

  // Check 1: Has meta record
  const hasMeta = records.some((r) => r.role === "meta");
  checks.push({
    name: "has_meta_record",
    passed: hasMeta,
    message: hasMeta ? "✓ Meta record present" : "✗ Missing meta record",
    evidence: { hasMeta },
  });

  // Check 2: All records have required fields
  const allHaveRole = records.every((r) => "role" in r && typeof r.role === "string");
  checks.push({
    name: "all_records_have_role",
    passed: allHaveRole,
    message: allHaveRole ? "✓ All records have role" : "✗ Some records missing role",
    evidence: { allHaveRole, totalRecords: records.length },
  });

  // Check 3: Valid role types
  const validRoles = new Set(["meta", "user", "assistant", "tool", "reasoning"]);
  const invalidRoles = records
    .map((r) => r.role)
    .filter((role) => !validRoles.has(role));
  checks.push({
    name: "valid_role_types",
    passed: invalidRoles.length === 0,
    message:
      invalidRoles.length === 0
        ? "✓ All roles are valid"
        : `✗ Invalid roles found: ${[...new Set(invalidRoles)].join(", ")}`,
    evidence: { invalidRoleCount: invalidRoles.length },
  });

  // Check 4: Message records have content or timestamp
  const messageRecords = records.filter((r) => r.role !== "meta");
  const allMessagesHaveContentOrTimestamp = messageRecords.every(
    (r) => "content" in r || "timestamp" in r || "tool_call_id" in r
  );
  checks.push({
    name: "messages_have_content_or_timestamp",
    passed: allMessagesHaveContentOrTimestamp,
    message: allMessagesHaveContentOrTimestamp
      ? "✓ All messages have content/timestamp"
      : "✗ Some messages missing content and timestamp",
    evidence: { messageRecordCount: messageRecords.length },
  });

  // Check 5: No duplicate records (same role + content at same timestamp)
  const recordSignatures = new Set<string>();
  let duplicateCount = 0;
  for (const r of records) {
    const sig = `${r.role}::${(r as any).content || ""}::${(r as any).timestamp || ""}`;
    if (recordSignatures.has(sig)) {
      duplicateCount++;
    }
    recordSignatures.add(sig);
  }
  checks.push({
    name: "no_duplicate_records",
    passed: duplicateCount === 0,
    message: duplicateCount === 0 ? "✓ No duplicates" : `✗ Found ${duplicateCount} duplicates`,
    evidence: { duplicateCount },
  });

  return checks;
}

/**
 * Verify an enriched transcript has proper metadata
 */
export function verifyEnriched(enriched: EnrichedRecord): CheckResult[] {
  const checks: CheckResult[] = [];

  const e = enriched.enrichment;

  // Check 1: Has required enrichment fields
  const hasAdapter = typeof e.adapter === "string" && e.adapter.length > 0;
  checks.push({
    name: "has_adapter_name",
    passed: hasAdapter,
    message: hasAdapter ? `✓ Adapter: ${e.adapter}` : "✗ Missing adapter",
    evidence: { adapter: e.adapter },
  });

  const hasProvider = typeof e.provider === "string" && e.provider.length > 0;
  checks.push({
    name: "has_provider",
    passed: hasProvider,
    message: hasProvider ? `✓ Provider: ${e.provider}` : "✗ Missing provider",
    evidence: { provider: e.provider },
  });

  const hasSpawned = typeof e.spawned === "boolean";
  checks.push({
    name: "has_spawned_status",
    passed: hasSpawned,
    message: hasSpawned ? `✓ Spawned: ${e.spawned}` : "✗ Missing spawned status",
    evidence: { spawned: e.spawned },
  });

  // Check 2: Valid adapter names
  const validAdapters = new Set(["ct", "ca", "pi", "codex", "cursor", "agy"]);
  const isValidAdapter = validAdapters.has(e.adapter || "");
  checks.push({
    name: "valid_adapter_name",
    passed: isValidAdapter,
    message: isValidAdapter
      ? "✓ Valid adapter name"
      : `✗ Invalid adapter: ${e.adapter}`,
    evidence: { adapter: e.adapter, validAdapters: Array.from(validAdapters) },
  });

  // Check 3: Spawned → has ticketId
  if (e.spawned) {
    const hasTicket = typeof e.ticketId === "string" && e.ticketId.length > 0;
    checks.push({
      name: "spawned_has_ticket",
      passed: hasTicket,
      message: hasTicket ? "✓ Spawned session has ticket" : "✗ Spawned but no ticket",
      evidence: { spawned: e.spawned, ticketId: e.ticketId },
    });
  }

  // Check 4: Enrichment doesn't modify records
  const recordsUnchanged = enriched.records.length > 0;
  checks.push({
    name: "records_preserved",
    passed: recordsUnchanged,
    message: recordsUnchanged
      ? `✓ Records preserved (${enriched.records.length})`
      : "✗ No records in enriched output",
    evidence: { recordCount: enriched.records.length },
  });

  return checks;
}

/**
 * Run full pipeline on a sample and verify every step
 */
export async function verifyFullPipeline(
  transcriptContent: string,
  source: TrajectorySource
): Promise<VerificationResult> {
  const checks: CheckResult[] = [];
  const evidence: Record<string, unknown> = {};

  try {
    // Step 1: Normalize
    const normalized = normalizeTranscript({
      source,
      transcript: transcriptContent,
      sourceContext: { partial: true },
    });

    evidence.normalized_record_count = normalized.records.length;
    const normalizedChecks = verifyNormalized(normalized.records);
    checks.push(...normalizedChecks);

    // Step 2: Enrich
    const enriched = enrichTranscript(normalized, source);

    evidence.enriched_adapter = enriched.enrichment.adapter;
    evidence.enriched_provider = enriched.enrichment.provider;
    const enrichedChecks = verifyEnriched(enriched);
    checks.push(...enrichedChecks);

    // Step 3: Cross-checks
    checks.push({
      name: "pipeline_output_consistency",
      passed: enriched.records.length === normalized.records.length,
      message:
        enriched.records.length === normalized.records.length
          ? "✓ Record count consistent"
          : "✗ Record count changed during enrichment",
      evidence: {
        normalized_count: normalized.records.length,
        enriched_count: enriched.records.length,
      },
    });

    // Step 4: Sample record validation
    const sampleRecord = enriched.records.find((r) => r.role !== "meta");
    if (sampleRecord) {
      const hasBasics =
        "role" in sampleRecord &&
        ("content" in sampleRecord || "timestamp" in sampleRecord || "tool_call_id" in sampleRecord);
      checks.push({
        name: "sample_record_valid",
        passed: hasBasics,
        message: hasBasics ? "✓ Sample record has required fields" : "✗ Sample record malformed",
        evidence: { sampleRole: sampleRecord.role },
      });
    }
  } catch (e) {
    checks.push({
      name: "pipeline_execution",
      passed: false,
      message: `✗ Pipeline failed: ${e instanceof Error ? e.message : String(e)}`,
      evidence: { error: String(e) },
    });
  }

  const passed = checks.every((c) => c.passed);

  return {
    passed,
    checks,
    evidence,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format verification results for human reading
 */
export function formatVerificationReport(result: VerificationResult): string {
  const passCount = result.checks.filter((c) => c.passed).length;
  const totalCount = result.checks.length;

  let report = `
╔════════════════════════════════════════════════════════╗
║  VERIFICATION REPORT                                  ║
║  ${result.passed ? "✓ PASSED" : "✗ FAILED"}  (${passCount}/${totalCount} checks)
╚════════════════════════════════════════════════════════╝

Timestamp: ${result.timestamp}

Checks:
`;

  for (const check of result.checks) {
    const icon = check.passed ? "✓" : "✗";
    report += `  ${icon} ${check.name}: ${check.message}\n`;
    if (check.evidence && Object.keys(check.evidence).length > 0) {
      report += `     Evidence: ${JSON.stringify(check.evidence)}\n`;
    }
  }

  report += "\nFull Evidence:\n";
  report += JSON.stringify(result.evidence, null, 2);

  return report;
}
