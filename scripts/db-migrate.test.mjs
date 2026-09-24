import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const migrationCli = resolve(import.meta.dirname, "db-migrate.mjs");

test("migration plan is deterministic and includes content checksums", () => {
  const first = spawnSync(process.execPath, [migrationCli, "--plan"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });
  const second = spawnSync(process.execPath, [migrationCli, "--plan"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);

  const plan = JSON.parse(first.stdout);
  assert.deepEqual(
    plan.map(({ name }) => name),
    ["0001_init.sql", "0002_profile_settings.sql", "0003_chat.sql", "0004_acknowledgement_prototype.sql", "0005_managed_auth_identities.sql", "0006_operator_allowlist.sql", "0007_operator_pause.sql"],
  );
  assert.ok(plan.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));
});

test("migration command refuses to run without an explicit database URL", () => {
  const result = spawnSync(process.execPath, [migrationCli], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL is required/);
});
