import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { REQUIRED_AUTH_FEASIBILITY_CHECKS } from "./auth-feasibility-checks.mjs";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("scripts/auth-feasibility-report.mjs");

function evidence(overrides = {}) {
  return {
    schema_version: 1,
    provider: "Supabase Auth",
    environment: "synthetic-staging",
    evidence_date: "2026-09-23",
    checks: Object.fromEntries(
      REQUIRED_AUTH_FEASIBILITY_CHECKS.map((name) => [
        name,
        {
          status: "passed",
          evidence: `Synthetic result for ${name}`,
          checked_on: "2026-09-23",
          procedure: `npm run synthetic:${name}`,
          observed_result: `${name} produced the expected staging response`,
          artifact: `artifacts/${name}.json`,
        },
      ]),
    ),
    sources: [
      {
        title: "Supabase Auth documentation",
        url: "https://supabase.com/docs/guides/auth",
        checked_on: "2026-09-23",
      },
    ],
    recommendation: {
      decision: "adopt",
      rationale: "Every required check passed in synthetic staging.",
      remaining_requirements: [],
    },
    ...overrides,
  };
}

async function writeEvidence(value) {
  const directory = await mkdtemp(path.join(tmpdir(), "auth-feasibility-"));
  const evidencePath = path.join(directory, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(value));
  return evidencePath;
}

test("accepts a dated, fully evidenced adopt recommendation", async () => {
  const evidencePath = await writeEvidence(evidence());
  const { stdout } = await execFileAsync(process.execPath, [cliPath, evidencePath]);

  assert.match(stdout, /Decision: ADOPT/);
  assert.match(stdout, /19\/19 required checks passed/);
});

test("rejects adoption when any required check lacks passing evidence", async () => {
  const value = evidence();
  value.checks.operator_mfa = {
    status: "not_run",
    evidence: "No staging project was configured.",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, evidencePath]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /Decision: INCOMPLETE/);
      assert.match(error.stdout, /operator_mfa: not_run/);
      return true;
    },
  );
});

test("rejects a passed check supported only by prose", async () => {
  const value = evidence();
  value.checks.operator_mfa = {
    status: "passed",
    evidence: "MFA worked in staging.",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, evidencePath]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(
        error.stderr,
        /checks\.operator_mfa passed evidence requires checked_on, procedure, observed_result, and artifact/,
      );
      return true;
    },
  );
});

test("rejects a complete-looking proof that was not run in synthetic staging", async () => {
  const evidencePath = await writeEvidence(
    evidence({ environment: "repository review only" }),
  );

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, evidencePath]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /a complete proof requires environment synthetic-staging/);
      return true;
    },
  );
});

test("rejects evidence with an undated non-primary source", async () => {
  const evidencePath = await writeEvidence(
    evidence({
      sources: [
        {
          title: "Third-party summary",
          url: "https://example.com/supabase",
          checked_on: "",
        },
      ],
    }),
  );

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, evidencePath]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /sources\[0\] must be dated Supabase primary documentation/);
      return true;
    },
  );
});

test("keeps a reject recommendation incomplete while a required check fails", async () => {
  const value = evidence({
    recommendation: {
      decision: "reject",
      rationale: "A demonstrated requirement failed.",
      remaining_requirements: ["Resolve or accept the failed requirement."],
    },
  });
  value.checks.stale_access_token = {
    status: "failed",
    evidence: "A revoked access token was accepted by the protected endpoint.",
  };
  const evidencePath = await writeEvidence(value);

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, evidencePath]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /Decision: INCOMPLETE/);
      assert.match(error.stdout, /ticket cannot complete while any required check fails/);
      return true;
    },
  );
});
