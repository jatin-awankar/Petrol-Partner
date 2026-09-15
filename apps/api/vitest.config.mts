import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "test";
process.env.APP_ORIGIN ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test";
process.env.ACCESS_TOKEN_SECRET ??= "test-access-token-secret-at-least-32-characters";
process.env.REFRESH_TOKEN_SECRET ??= "test-refresh-token-secret-at-least-32-characters";
process.env.ENABLE_CHAT ??= "false";
process.env.ENABLE_TRACKING ??= "false";
process.env.ENABLE_MATCH_REFRESH_PROCESSOR ??= "false";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
