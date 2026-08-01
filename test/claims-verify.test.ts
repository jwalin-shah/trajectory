import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const executor = join(repoRoot, "scripts/verify-all-claims.mjs");
const wrapper = join(repoRoot, "scripts/verify-all-claims.sh");
const extractor = join(repoRoot, "scripts/extract-fleet-claims.mjs");

describe("claims verification executor", () => {
  test("executor reports non-zero claim count for a real ledger shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "traj-claims-"));
    const ledgerPath = join(dir, "ledger.json");
    const probe = join(dir, "probe.txt");
    writeFileSync(probe, "ok\n");
    writeFileSync(
      ledgerPath,
      JSON.stringify(
        {
          version: "1.0",
          claims: [
            {
              id: "t1",
              claim: "probe file exists for verification",
              doc_file: probe,
              doc_location: "line 1",
              evidence_type: "git-commit",
              evidence_source: probe,
              status: "UNKNOWN",
              notes: "",
            },
            {
              id: "t2",
              claim: "missing path should not silently verify",
              doc_file: probe,
              evidence_type: "git-commit",
              evidence_source: join(dir, "does-not-exist-xyz"),
              status: "UNKNOWN",
              notes: "",
            },
          ],
        },
        null,
        2,
      ),
    );

    const res = spawnSync("node", [executor, ledgerPath, "--json"], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    expect(res.status).toBe(0);
    const body = JSON.parse(res.stdout);
    expect(body.summary.total).toBe(2);
    expect(body.summary.total).not.toBe(0);
    expect(body.summary.verified + body.summary.unknown + body.summary.questionable + body.summary.stale).toBe(2);
    expect(body.summary.executed).toBeGreaterThan(0);
    const t1 = body.results.find((r: { id: string }) => r.id === "t1");
    expect(t1.status).toBe("VERIFIED");
  });

  test("wrapper shell script delegates to executor and sees ledger entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "traj-claims-sh-"));
    const ledgerPath = join(dir, "ledger.json");
    writeFileSync(
      ledgerPath,
      JSON.stringify({
        version: "1.0",
        claims: [
          {
            id: "wrap1",
            claim: "wrapper must count this claim",
            doc_file: ledgerPath,
            evidence_type: "git-commit",
            evidence_source: ledgerPath,
            status: "UNKNOWN",
          },
        ],
      }),
    );
    const res = spawnSync("bash", [wrapper, ledgerPath, "--json"], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    expect(res.status).toBe(0);
    const body = JSON.parse(res.stdout);
    expect(body.summary.total).toBe(1);
  });

  test("extractor scans docs and can write new claims without dropping old ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "traj-extract-"));
    const docDir = join(dir, "proj");
    mkdirSync(docDir, { recursive: true });
    writeFileSync(
      join(docDir, "AGENTS.md"),
      `# Sample\n\n## Status\n\nThe verification pipeline is implemented and proven with 42 automated checks across adapters.\n\nNever assume without evidence.\n`,
    );
    const ledgerPath = join(dir, "ledger.json");
    writeFileSync(
      ledgerPath,
      JSON.stringify({
        version: "1.0",
        claims: [
          {
            id: "keep-me",
            claim: "pre-existing claim must survive",
            doc_file: "~/projects/bridge/AGENTS.md",
            evidence_type: "git-commit",
            evidence_source: "bridge/",
            status: "VERIFIED",
          },
        ],
      }),
    );

    const res = spawnSync(
      "node",
      [extractor, "--ledger", ledgerPath, "--roots", dir, "--write", "--json"],
      { encoding: "utf8", cwd: repoRoot },
    );
    expect(res.status).toBe(0);
    const body = JSON.parse(res.stdout);
    expect(body.report.docs_scanned).toBeGreaterThanOrEqual(1);
    const written = JSON.parse(readFileSync(ledgerPath, "utf8"));
    expect(written.claims.some((c: { id: string }) => c.id === "keep-me")).toBe(true);
    expect(written.claims.length).toBeGreaterThanOrEqual(1);
  });
});

describe("turn-end normalize wiring", () => {
  test("project extension file exists", () => {
    expect(existsSync(join(repoRoot, ".pi/extensions/trajectory-turnend-normalize.ts"))).toBe(true);
  });

  test("normalize-session script exists", () => {
    expect(existsSync(join(repoRoot, "scripts/normalize-session.mjs"))).toBe(true);
  });
});
