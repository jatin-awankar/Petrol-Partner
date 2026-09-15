import { describe, expect, it } from "vitest";

import { assertSafeAutomatedDatabase } from "./database-safety";

describe("assertSafeAutomatedDatabase", () => {
  it("rejects a production-looking database while tests are running", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://app:secret@db.example.com/petrol_partner",
        nodeEnv: "test",
        ci: false,
      }),
    ).toThrow(/disposable PostgreSQL database/);
  });

  it("accepts an explicitly named local test database", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test",
        nodeEnv: "test",
        ci: false,
      }),
    ).not.toThrow();
  });

  it("enforces the test database rule in CI even when NODE_ENV is not test", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://app:secret@db.example.com/petrol_partner",
        nodeEnv: "development",
        ci: true,
      }),
    ).toThrow(/disposable PostgreSQL database/);
  });
});
