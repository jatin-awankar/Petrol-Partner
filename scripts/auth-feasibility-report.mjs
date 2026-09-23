#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const REQUIRED_CHECKS = [
  "email_verification",
  "login",
  "account_recovery",
  "server_identity_validation",
  "operator_mfa",
  "mfa_server_enforcement",
  "current_session_revocation",
  "stale_access_token",
  "eligibility_independent_of_provider",
  "operator_allowlist_independent_of_provider",
  "abuse_controls",
  "secure_cookies",
  "origin_csrf",
  "auth_outage",
  "provider_subject_mapping",
  "duplicate_missing_email",
  "account_claim_fallback",
  "limits_smtp_costs",
  "export_restore",
];

const TERMINAL_STATUSES = new Set(["passed", "failed"]);
const DECISIONS = new Set(["adopt", "reject"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  throw new Error(message);
}

function validatePrimarySources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    fail("sources must contain dated Supabase primary documentation");
  }

  sources.forEach((source, index) => {
    let url;
    try {
      url = new URL(source?.url);
    } catch {
      fail(`sources[${index}] must be dated Supabase primary documentation`);
    }

    if (
      url.protocol !== "https:" ||
      (url.hostname !== "supabase.com" && !url.hostname.endsWith(".supabase.com")) ||
      !ISO_DATE.test(source?.checked_on ?? "") ||
      typeof source?.title !== "string" ||
      source.title.trim() === ""
    ) {
      fail(`sources[${index}] must be dated Supabase primary documentation`);
    }
  });
}

export function assessEvidence(value) {
  if (value?.schema_version !== 1) {
    fail("schema_version must be 1");
  }
  if (value.provider !== "Supabase Auth") {
    fail('provider must be "Supabase Auth"');
  }
  if (typeof value.environment !== "string" || value.environment.trim() === "") {
    fail("environment is required");
  }
  if (!ISO_DATE.test(value.evidence_date ?? "")) {
    fail("evidence_date must use YYYY-MM-DD");
  }

  validatePrimarySources(value.sources);

  if (!value.checks || typeof value.checks !== "object" || Array.isArray(value.checks)) {
    fail("checks must be an object");
  }

  const results = REQUIRED_CHECKS.map((name) => {
    const check = value.checks[name];
    if (!check || typeof check.status !== "string") {
      fail(`checks.${name} is required`);
    }
    if (typeof check.evidence !== "string" || check.evidence.trim() === "") {
      fail(`checks.${name}.evidence is required`);
    }
    return { name, status: check.status, evidence: check.evidence.trim() };
  });

  const decision = value.recommendation?.decision;
  if (!DECISIONS.has(decision)) {
    fail('recommendation.decision must be "adopt" or "reject"');
  }
  if (
    typeof value.recommendation?.rationale !== "string" ||
    value.recommendation.rationale.trim() === ""
  ) {
    fail("recommendation.rationale is required");
  }
  if (!Array.isArray(value.recommendation?.remaining_requirements)) {
    fail("recommendation.remaining_requirements must be an array");
  }

  const unfinished = results.filter((result) => !TERMINAL_STATUSES.has(result.status));
  const failed = results.filter((result) => result.status === "failed");
  const inconsistentAdoption = decision === "adopt" && failed.length > 0;
  const complete = unfinished.length === 0 && !inconsistentAdoption;

  return {
    complete,
    decision: complete ? decision : "incomplete",
    failed,
    passed: results.filter((result) => result.status === "passed"),
    unfinished,
  };
}

function render(value, assessment) {
  const lines = [
    "Managed authentication feasibility",
    `Evidence: ${value.evidence_date} (${value.environment})`,
    `Decision: ${assessment.decision.toUpperCase()}`,
    `${assessment.passed.length}/${REQUIRED_CHECKS.length} required checks passed`,
  ];

  for (const result of [...assessment.failed, ...assessment.unfinished]) {
    lines.push(`- ${result.name}: ${result.status} — ${result.evidence}`);
  }

  if (!assessment.complete && value.recommendation?.decision === "adopt") {
    lines.push("- adoption is invalid until every required check passes");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    fail("Usage: node scripts/auth-feasibility-report.mjs <evidence.json>");
  }

  const content = await readFile(path.resolve(evidencePath), "utf8");
  const value = JSON.parse(content);
  const assessment = assessEvidence(value);
  process.stdout.write(render(value, assessment));
  if (!assessment.complete) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
