import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { REQUIRED_PROVIDER_ARRANGEMENT_CHECKS } from "./provider-arrangement-checks.mjs";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("scripts/provider-arrangement-report.mjs");

function evidence(overrides = {}) {
  return {
    schema_version: 1,
    arrangement: "render-supabase-resend-backblaze-better-stack",
    environment: "synthetic-staging",
    evidence_date: "2026-09-24",
    checks: Object.fromEntries(
      REQUIRED_PROVIDER_ARRANGEMENT_CHECKS.map((name) => [
        name,
        {
          status: "passed",
          evidence: `Synthetic result for ${name}`,
          checked_on: "2026-09-24",
          procedure: `run ${name}`,
          observed_result: `${name} met its measured pilot bound`,
          artifact: `artifacts/${name}.json`,
        },
      ]),
    ),
    sources: [
      {
        provider: "Render",
        title: "Pricing",
        url: "https://render.com/pricing",
        checked_on: "2026-09-24",
      },
    ],
    recommendation: {
      decision: "adopt",
      rationale: "The selected arrangement passed every required staging check.",
      selected_by: "maintainer",
      selected_on: "2026-09-24",
      remaining_requirements: [],
    },
    ...overrides,
  };
}

async function writeEvidence(value) {
  const directory = await mkdtemp(path.join(tmpdir(), "provider-arrangement-"));
  const evidencePath = path.join(directory, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(value));
  return evidencePath;
}

test("accepts a dated, fully evidenced maintainer selection", async () => {
  const evidencePath = await writeEvidence(evidence());
  const { stdout } = await execFileAsync(process.execPath, [cliPath, evidencePath]);

  assert.match(stdout, /Decision: ADOPT/);
  assert.match(stdout, /14\/14 required checks passed/);
});

test("keeps the arrangement incomplete while actual provider semantics are untested", async () => {
  const value = evidence();
  value.checks.recovery_provider_semantics = {
    status: "not_run",
    evidence: "No authorized provider bucket was available.",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /Decision: INCOMPLETE/);
    assert.match(error.stdout, /recovery_provider_semantics: not_run/);
    return true;
  });
});

test("requires explicit commercial-use eligibility evidence", async () => {
  const value = evidence();
  delete value.checks.commercial_eligibility;
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /checks\.commercial_eligibility is required/);
    return true;
  });
});

test("rejects prose-only passing evidence", async () => {
  const value = evidence();
  value.checks.timely_executor = {
    status: "passed",
    evidence: "The worker appeared timely.",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /checks\.timely_executor passed evidence requires/);
    return true;
  });
});

test("rejects a source that is not dated provider documentation", async () => {
  const value = evidence();
  value.sources = [{ provider: "Summary", title: "Blog", url: "https://example.com", checked_on: "" }];
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /sources\[0\] must be dated HTTPS provider documentation/);
    return true;
  });
});

test("rejects adoption without an explicit maintainer selection", async () => {
  const value = evidence();
  value.recommendation.selected_by = "";
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /terminal decision requires selected_by and selected_on/);
    return true;
  });
});

test("does not accept a documentation-only environment as a complete proof", async () => {
  const evidencePath = await writeEvidence(evidence({ environment: "documentation-review" }));

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /a complete arrangement requires environment synthetic-staging/);
    return true;
  });
});

test("keeps a fully evidenced rejection incomplete while preserving the failed check", async () => {
  const value = evidence({
    recommendation: {
      decision: "reject",
      rationale: "The live provider failed a required durability check.",
      selected_by: "maintainer",
      selected_on: "2026-09-24",
      remaining_requirements: ["Keep launch blocked or select another arrangement."],
    },
  });
  value.checks.recovery_provider_semantics = {
    status: "failed",
    evidence: "A locked receipt could be deleted before its retention date.",
    checked_on: "2026-09-24",
    procedure: "Upload and lock a synthetic receipt, then attempt deletion before expiry.",
    observed_result: "The provider returned success for the premature deletion.",
    artifact: "artifacts/locked-receipt-deletion.json",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /Decision: REJECT \(INCOMPLETE\)/);
    assert.match(error.stdout, /recovery_provider_semantics: failed/);
    return true;
  });
});

test("keeps a rejection incomplete when a failed check has only prose", async () => {
  const value = evidence({
    recommendation: {
      decision: "reject",
      rationale: "The provider failed a required durability check.",
      selected_by: "maintainer",
      selected_on: "2026-09-24",
      remaining_requirements: ["Keep launch blocked."],
    },
  });
  value.checks.recovery_provider_semantics = {
    status: "failed",
    evidence: "A locked receipt could be deleted before its retention date.",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /checks\.recovery_provider_semantics failed evidence requires/);
    return true;
  });
});

test("rejects a fully tested provider rejection without the maintainer decision", async () => {
  const value = evidence({
    recommendation: {
      decision: "reject",
      rationale: "The provider failed a required durability check.",
      selected_by: "",
      selected_on: "",
      remaining_requirements: ["Keep launch blocked."],
    },
  });
  value.checks.recovery_provider_semantics = {
    status: "failed",
    evidence: "A locked receipt could be deleted before its retention date.",
    checked_on: "2026-09-24",
    procedure: "Upload and lock a synthetic receipt, then attempt deletion before expiry.",
    observed_result: "The provider returned success for the premature deletion.",
    artifact: "artifacts/locked-receipt-deletion.json",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(execFileAsync(process.execPath, [cliPath, evidencePath]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /terminal decision requires selected_by and selected_on/);
    return true;
  });
});
