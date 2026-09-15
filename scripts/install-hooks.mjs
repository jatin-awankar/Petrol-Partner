import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitDirectory = realpathSync(join(projectRoot, ".git"));
const existingHook = join(gitDirectory, "hooks", "pre-commit");
const preservedHook = join(projectRoot, ".githooks", "pre-commit.local");

mkdirSync(join(projectRoot, ".githooks"), { recursive: true });

if (existsSync(existingHook) && !existsSync(preservedHook)) {
  copyFileSync(existingHook, preservedHook);
  chmodSync(preservedHook, 0o755);
  console.log("Preserved the existing pre-commit hook as .githooks/pre-commit.local");
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: projectRoot,
  stdio: "inherit",
});
chmodSync(join(projectRoot, ".githooks", "pre-commit"), 0o755);
console.log("Installed Petrol Partner commit guards from .githooks");
