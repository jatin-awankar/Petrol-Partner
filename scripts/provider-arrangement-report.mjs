#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { REQUIRED_PROVIDER_ARRANGEMENT_CHECKS } from "./provider-arrangement-checks.mjs";

const TERMINAL_STATUSES = new Set(["passed", "failed"]);
const DECISIONS = new Set(["adopt", "reject"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  throw new Error(message);
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    fail("sources must contain dated HTTPS provider documentation");
  }

  sources.forEach((source, index) => {
    let url;
    try {
      url = new URL(source?.url);
    } catch {
      fail(`sources[${index}] must be dated HTTPS provider documentation`);
    }

    if (
      url.protocol !== "https:" ||
      !hasText(source?.provider) ||
      !hasText(source?.title) ||
      !ISO_DATE.test(source?.checked_on ?? "")
    ) {
      fail(`sources[${index}] must be dated HTTPS provider documentation`);
    }
  });
}

function validatePassedEvidence(name, check) {
  if (
    !ISO_DATE.test(check.checked_on ?? "") ||
    !hasText(check.procedure) ||
    !hasText(check.observed_result) ||
    !hasText(check.artifact)
  ) {
    fail(
      `checks.${name} passed evidence requires checked_on, procedure, observed_result, and artifact`,
    );
  }
}

export function assessEvidence(value) {
  if (value?.schema_version !== 1) fail("schema_version must be 1");
  if (!hasText(value.arrangement)) fail("arrangement is required");
  if (!hasText(value.environment)) fail("environment is required");
  if (!ISO_DATE.test(value.evidence_date ?? "")) {
    fail("evidence_date must use YYYY-MM-DD");
  }
  validateSources(value.sources);

  if (!value.checks || typeof value.checks !== "object" || Array.isArray(value.checks)) {
    fail("checks must be an object");
  }

  const results = REQUIRED_PROVIDER_ARRANGEMENT_CHECKS.map((name) => {
    const check = value.checks[name];
    if (!check || !hasText(check.status)) fail(`checks.${name} is required`);
    if (!hasText(check.evidence)) fail(`checks.${name}.evidence is required`);
    if (check.status === "passed") validatePassedEvidence(name, check);
    return { name, status: check.status, evidence: check.evidence.trim() };
  });

  const decision = value.recommendation?.decision;
  if (!DECISIONS.has(decision)) {
    fail('recommendation.decision must be "adopt" or "reject"');
  }
  if (!hasText(value.recommendation?.rationale)) {
    fail("recommendation.rationale is required");
  }
  if (!Array.isArray(value.recommendation?.remaining_requirements)) {
    fail("recommendation.remaining_requirements must be an array");
  }
  if (
    !hasText(value.recommendation?.selected_by) ||
    !ISO_DATE.test(value.recommendation?.selected_on ?? "")
  ) {
    fail("a terminal decision requires selected_by and selected_on from the maintainer's explicit choice");
  }

  const unfinished = results.filter((result) => !TERMINAL_STATUSES.has(result.status));
  const failed = results.filter((result) => result.status === "failed");
  const complete =
    unfinished.length === 0 && (decision === "reject" || failed.length === 0);
  if (complete && value.environment !== "synthetic-staging") {
    fail("a complete arrangement requires environment synthetic-staging");
  }

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
    "Provider arrangement evidence",
    `Evidence: ${value.evidence_date} (${value.environment})`,
    `Arrangement: ${value.arrangement}`,
    `Decision: ${assessment.decision.toUpperCase()}`,
    `${assessment.passed.length}/${REQUIRED_PROVIDER_ARRANGEMENT_CHECKS.length} required checks passed`,
  ];

  for (const result of [...assessment.failed, ...assessment.unfinished]) {
    lines.push(`- ${result.name}: ${result.status} — ${result.evidence}`);
  }
  if (assessment.failed.length > 0 && !assessment.complete) {
    lines.push("- the ticket cannot complete while any required check fails");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    fail("Usage: node scripts/provider-arrangement-report.mjs <evidence.json>");
  }
  const value = JSON.parse(await readFile(path.resolve(evidencePath), "utf8"));
  const assessment = assessEvidence(value);
  process.stdout.write(render(value, assessment));
  if (!assessment.complete) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
