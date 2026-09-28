import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(process.argv[2] ?? "/tmp/petrol-partner-release");
const git = (args, options = {}) => {
  const result = spawnSync("git", args, { cwd: root, encoding: options.encoding ?? "utf8", maxBuffer: 100 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr?.toString().trim() || `git ${args[0]} failed`);
  return result.stdout;
};

if (git(["status", "--porcelain"]).trim()) throw new Error("Commit or remove working-tree changes before packaging");
const commit = git(["rev-parse", "HEAD"]).trim();
const archive = git(["archive", "--format=tar", `--prefix=petrol-partner-${commit}/`, "HEAD"], { encoding: "buffer" });
const digest = createHash("sha256").update(archive).digest("hex");
mkdirSync(output, { recursive: true });
const name = `petrol-partner-${commit}.tar`;
writeFileSync(resolve(output, name), archive);
writeFileSync(resolve(output, `${name}.sha256`), `${digest}  ${name}\n`);
console.log(JSON.stringify({ commit, archive: resolve(output, name), sha256: digest, bytes: archive.length }));
