const expectedNode = "24.20.0";
const expectedNpm = "11.19.0";
const npmMatch = process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/);
const actualNpm = npmMatch?.[1];
const requireExact = process.argv.includes("--exact");
const nodeIsSupported = requireExact
  ? process.versions.node === expectedNode
  : process.versions.node.split(".")[0] === expectedNode.split(".")[0];
const npmIsSupported = requireExact
  ? actualNpm === expectedNpm
  : actualNpm?.split(".")[0] === expectedNpm.split(".")[0];

if (!nodeIsSupported || !npmIsSupported) {
  console.error(
    `Unsupported toolchain: expected ${requireExact ? "Node 24.20.0 and npm 11.19.0" : "Node 24.x and npm 11.x"}; received Node ${process.versions.node} and npm ${actualNpm ?? "unknown"}`,
  );
  process.exit(1);
}
