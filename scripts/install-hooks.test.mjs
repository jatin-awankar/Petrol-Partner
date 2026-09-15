import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const installer = join(projectRoot, "scripts/install-hooks.mjs");
const guard = join(projectRoot, "scripts/reject-main-commit.mjs");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("commit guard rejects main and permits a dedicated branch", () => {
  const repository = mkdtempSync(join(tmpdir(), "petrol-partner-guard-"));
  git(repository, "init", "-b", "main");

  const rejected = spawnSync(process.execPath, [guard], { cwd: repository, encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /dedicated codex\/ branch/);

  git(repository, "switch", "-c", "codex/01-checks");
  const permitted = spawnSync(process.execPath, [guard], { cwd: repository, encoding: "utf8" });
  assert.equal(permitted.status, 0);
});

test("hook installation preserves and runs an existing pre-commit hook", () => {
  const repository = mkdtempSync(join(tmpdir(), "petrol-partner-hooks-"));
  git(repository, "init", "-b", "main");
  mkdirSync(join(repository, "scripts"));
  mkdirSync(join(repository, ".githooks"));
  cpSync(installer, join(repository, "scripts/install-hooks.mjs"));
  cpSync(guard, join(repository, "scripts/reject-main-commit.mjs"));
  cpSync(join(projectRoot, ".githooks/pre-commit"), join(repository, ".githooks/pre-commit"));
  chmodSync(join(repository, ".githooks/pre-commit"), 0o755);

  const oldHook = join(repository, ".git/hooks/pre-commit");
  writeFileSync(oldHook, "#!/bin/sh\nprintf preserved > .existing-hook-ran\n");
  chmodSync(oldHook, 0o755);

  execFileSync(process.execPath, [join(repository, "scripts/install-hooks.mjs")], {
    cwd: repository,
  });
  assert.equal(git(repository, "config", "core.hooksPath"), ".githooks");
  assert.match(readFileSync(join(repository, ".githooks/pre-commit.local"), "utf8"), /preserved/);

  git(repository, "switch", "-c", "codex/01-checks");
  execFileSync(join(repository, ".githooks/pre-commit"), { cwd: repository });
  assert.equal(readFileSync(join(repository, ".existing-hook-ran"), "utf8"), "preserved");
});
