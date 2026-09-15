function assertSafeAutomatedDatabase(settings) {
  if (settings.nodeEnv !== "test" && !settings.ci) {
    return;
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(settings.databaseUrl);
  } catch {
    throw new Error("Automated checks require a valid disposable PostgreSQL database URL");
  }

  const databaseName = databaseUrl.pathname.slice(1);
  const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(databaseUrl.hostname);
  if (
    !settings.disposableDatabaseAcknowledged ||
    !isLoopback ||
    !databaseName.endsWith("_test")
  ) {
    throw new Error(
      "Automated checks require a disposable PostgreSQL database: set TEST_DATABASE_DISPOSABLE=true, use a loopback host, and use a database name ending in _test",
    );
  }
}

module.exports = { assertSafeAutomatedDatabase };
