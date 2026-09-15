import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:56379";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
