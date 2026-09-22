import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const runtimeCheck = resolve(import.meta.dirname, "assert-runtime.mjs");
const projectRoot = resolve(import.meta.dirname, "..");

function runRuntimeCheck(environment) {
  if (environment.nodeImage) {
    const result = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "--volume",
        `${projectRoot}:/workspace:ro`,
        "--workdir",
        "/workspace",
        "--env",
        `npm_config_user_agent=${environment.npmUserAgent}`,
        environment.nodeImage,
        "sh",
        "-c",
        "node -p process.versions.node && node scripts/assert-runtime.mjs",
      ],
      { encoding: "utf8" },
    );

    return { ...result, nodeVersion: result.stdout.trim().split("\n")[0] };
  }

  const result = spawnSync(process.execPath, [runtimeCheck, ...(environment.requireExact ? ["--exact"] : [])], {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_user_agent: environment.npmUserAgent,
    },
  });
  const nodeVersion = spawnSync(process.execPath, ["-p", "process.versions.node"], {
    encoding: "utf8",
  }).stdout.trim();

  return { ...result, nodeVersion };
}

test("accepts Vercel's Node 24.19 and npm 11.17 runtime", () => {
  const result = runRuntimeCheck({
    nodeImage: "node:24.19.0-alpine",
    npmUserAgent: "npm/11.17.0 node/v24.19.0",
    requireExact: false,
  });
  assert.equal(result.nodeVersion, "24.19.0");
  assert.equal(result.status, 0, result.stderr);
});

test("exact development verification rejects another npm patch version", () => {
  const result = runRuntimeCheck({ npmUserAgent: "npm/11.17.0 node/v24.19.0", requireExact: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected Node 24.20.0 and npm 11.19.0/);
});
