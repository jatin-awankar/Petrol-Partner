import { describe, expect, it } from "vitest";

import { assertSafeAutomatedDatabase } from "@petrol-partner/runtime-config";

describe("assertSafeAutomatedDatabase", () => {
  it("rejects a production-looking database while tests are running", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://app:secret@db.example.com/petrol_partner",
        nodeEnv: "test",
        ci: false,
        disposableDatabaseAcknowledged: true,
      }),
    ).toThrow(/disposable PostgreSQL database/);
  });

  it("accepts an explicitly named local test database", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test",
        nodeEnv: "test",
        ci: false,
        disposableDatabaseAcknowledged: true,
      }),
    ).not.toThrow();
  });

  it("enforces the test database rule in CI even when NODE_ENV is not test", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://app:secret@db.example.com/petrol_partner",
        nodeEnv: "development",
        ci: true,
        disposableDatabaseAcknowledged: true,
      }),
    ).toThrow(/disposable PostgreSQL database/);
  });

  it("rejects a remote database even when its name looks like a test database", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://app:secret@prod.example.com/petrol_partner_test",
        nodeEnv: "test",
        ci: false,
        disposableDatabaseAcknowledged: true,
      }),
    ).toThrow(/loopback host/);
  });

  it("requires an explicit disposable database acknowledgement", () => {
    expect(() =>
      assertSafeAutomatedDatabase({
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:55432/petrol_partner_test",
        nodeEnv: "test",
        ci: false,
        disposableDatabaseAcknowledged: false,
      }),
    ).toThrow(/TEST_DATABASE_DISPOSABLE=true/);
  });
});
