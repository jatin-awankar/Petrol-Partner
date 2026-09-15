const expectedNode = "24.20.0";
const expectedNpm = "11.19.0";
const npmMatch = process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/);
const actualNpm = npmMatch?.[1];

if (process.versions.node !== expectedNode || actualNpm !== expectedNpm) {
  console.error(
    `Unsupported toolchain: expected Node ${expectedNode} and npm ${expectedNpm}; received Node ${process.versions.node} and npm ${actualNpm ?? "unknown"}`,
  );
  process.exit(1);
}
