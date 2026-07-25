/**
 * Claims system - make every assertion provable
 * Prevents assumptions from hiding in plain sight
 */

export type EvidenceType =
  | "test_pass"
  | "file_exists"
  | "command_output"
  | "verification_check"
  | "code_inspection"
  | "sample_result"
  | "calculated_aggregate";

export interface Evidence {
  type: EvidenceType;
  description: string;
  data: unknown;
  timestamp: string;
  location?: string; // file path, line number, command, etc.
}

export interface Claim {
  id: string;
  statement: string;
  evidence: Evidence[];
  verified: boolean;
  reasoning: string;
  timestamp: string;
}

/**
 * Track a claim that must be proven
 */
export class ClaimTracker {
  private claims: Map<string, Claim> = new Map();
  private nextId: number = 0;

  /**
   * Register a claim that needs evidence
   * Returns claim ID for tracking
   */
  makeClaim(statement: string, reasoning: string): string {
    const id = `claim_${this.nextId++}`;

    this.claims.set(id, {
      id,
      statement,
      evidence: [],
      verified: false,
      reasoning,
      timestamp: new Date().toISOString(),
    });

    return id;
  }

  /**
   * Add evidence to support a claim
   */
  addEvidence(
    claimId: string,
    type: EvidenceType,
    description: string,
    data: unknown,
    location?: string
  ): void {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    claim.evidence.push({
      type,
      description,
      data,
      timestamp: new Date().toISOString(),
      ...(location ? { location } : {}),
    });
  }

  /**
   * Mark claim as verified once evidence is sufficient
   */
  verifyClaim(claimId: string): void {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    if (claim.evidence.length === 0) {
      throw new Error(`Cannot verify claim without evidence: ${claimId}`);
    }

    claim.verified = true;
  }

  /**
   * Get a claim with all its evidence
   */
  getClaim(claimId: string): Claim | undefined {
    return this.claims.get(claimId);
  }

  /**
   * List all unverified claims (the danger zone)
   */
  getUnverifiedClaims(): Claim[] {
    return Array.from(this.claims.values()).filter((c) => !c.verified);
  }

  /**
   * Generate audit report of all claims
   */
  auditReport(): string {
    const verified = Array.from(this.claims.values()).filter((c) => c.verified);
    const unverified = Array.from(this.claims.values()).filter((c) => !c.verified);

    let report = `
╔════════════════════════════════════════════════════════╗
║  CLAIMS AUDIT REPORT                                  ║
╚════════════════════════════════════════════════════════╝

VERIFIED CLAIMS: ${verified.length}
UNVERIFIED CLAIMS: ${unverified.length}

`;

    if (verified.length > 0) {
      report += `VERIFIED (safe to rely on):\n`;
      for (const claim of verified) {
        report += `\n  ✓ ${claim.statement}\n`;
        report += `    Reasoning: ${claim.reasoning}\n`;
        report += `    Evidence (${claim.evidence.length} pieces):\n`;
        for (const ev of claim.evidence) {
          report += `      - ${ev.type}: ${ev.description}`;
          if (ev.location) report += ` @ ${ev.location}`;
          report += `\n`;
        }
      }
    }

    if (unverified.length > 0) {
      report += `\n⚠️  UNVERIFIED (DANGEROUS - DO NOT RELY ON):\n`;
      for (const claim of unverified) {
        report += `\n  ✗ ${claim.statement}\n`;
        report += `    Reasoning: ${claim.reasoning}\n`;
        report += `    Evidence: ${claim.evidence.length} pieces (INSUFFICIENT)\n`;
        if (claim.evidence.length > 0) {
          for (const ev of claim.evidence) {
            report += `      - ${ev.type}: ${ev.description}\n`;
          }
        }
      }
    }

    return report;
  }
}

/**
 * Example: How to use claims system
 */
export function exampleUsage() {
  const tracker = new ClaimTracker();

  // Make a claim
  const claimId = tracker.makeClaim(
    "All 7,312 transcripts can be normalized",
    "We built 6 adapters and tested them on real data"
  );

  // Add evidence
  tracker.addEvidence(
    claimId,
    "verification_check",
    "CT adapter: 12/12 checks passed",
    { adapter: "ct", passed: 12, total: 12 },
    "scripts/verify-all-adapters.js"
  );

  tracker.addEvidence(
    claimId,
    "verification_check",
    "CA adapter: 12/12 checks passed",
    { adapter: "ca", passed: 12, total: 12 },
    "scripts/verify-all-adapters.js"
  );

  tracker.addEvidence(
    claimId,
    "verification_check",
    "PI adapter: 12/12 checks passed",
    { adapter: "pi", passed: 12, total: 12 },
    "scripts/verify-all-adapters.js"
  );

  // Once evidence is sufficient, verify
  tracker.verifyClaim(claimId);

  // Get audit report
  const report = tracker.auditReport();
  console.log(report);
}
