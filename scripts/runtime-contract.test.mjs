import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const runtimeCheck = resolve(import.meta.dirname, "assert-runtime.mjs");

function runRuntimeCheck(environment) {
  return spawnSync(process.execPath, [runtimeCheck, ...(environment.requireExact ? ["--exact"] : [])], {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_user_agent: environment.npmUserAgent,
    },
  });
}

test("accepts Vercel-compatible npm within the supported major version", () => {
  const result = runRuntimeCheck({ npmUserAgent: "npm/11.17.0 node/v24.19.0", requireExact: false });
  assert.equal(result.status, 0, result.stderr);
});

test("exact development verification rejects another npm patch version", () => {
  const result = runRuntimeCheck({ npmUserAgent: "npm/11.17.0 node/v24.19.0", requireExact: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected Node 24.20.0 and npm 11.19.0/);
});
