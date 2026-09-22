import { execFileSync } from "node:child_process";

let branch;
try {
  branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
} catch (error) {
  console.error(`Unable to determine the current branch: ${error.message}`);
  process.exit(1);
}

if (branch === "main") {
  console.error("Commit rejected on main. Switch to a dedicated codex/ branch first.");
  process.exit(1);
}
