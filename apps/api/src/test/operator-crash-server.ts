import { createApp } from "../app";
import { setAuthProviderForTests, setManagedAuthEnabledForTests } from "../modules/auth/auth-provider";
import { setPauseCrashHookForTests, type PauseCrashPoint } from "../modules/operator/pause.service";

const identity = { subject: "pause-subject", email: "pause-operator@example.test", emailVerified: true, assuranceLevel: "aal2" as const, userMetadata: {} };
const session = { accessToken: "crash-test-access", refreshToken: "crash-test-refresh", expiresIn: 900, identity };
setManagedAuthEnabledForTests(true);
setAuthProviderForTests({
  register: async () => undefined, login: async () => session, validate: async () => identity,
  refresh: async () => session, requestRecovery: async () => undefined,
  updatePassword: async () => undefined, logout: async () => undefined,
  exchangeCode: async () => session,
});
const crashPoint = process.env.PILOT_TEST_CRASH_POINT as PauseCrashPoint | undefined;
if (crashPoint) setPauseCrashHookForTests((point) => { if (point === crashPoint) process.exit(92); });
const server = createApp().listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Crash test server has no TCP port");
  process.stdout.write(`READY:${address.port}\n`);
});
