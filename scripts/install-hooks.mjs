import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preservedHook = join(projectRoot, ".githooks", "pre-commit.local");
const hooksPathResult = spawnSync("git", ["config", "--get", "core.hooksPath"], {
  cwd: projectRoot,
  encoding: "utf8",
});
const configuredHooksPath = hooksPathResult.status === 0 ? hooksPathResult.stdout.trim() : "";
const existingHook = configuredHooksPath
  ? resolve(projectRoot, configuredHooksPath, "pre-commit")
  : execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-commit"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();

mkdirSync(join(projectRoot, ".githooks"), { recursive: true });

if (
  configuredHooksPath !== ".githooks" &&
  existsSync(existingHook) &&
  !existsSync(preservedHook)
) {
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
