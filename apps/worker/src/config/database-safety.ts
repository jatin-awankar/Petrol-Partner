interface AutomatedDatabaseSettings {
  databaseUrl: string;
  nodeEnv: string;
  ci: boolean;
}

export function assertSafeAutomatedDatabase(settings: AutomatedDatabaseSettings) {
  if (settings.nodeEnv !== "test" && !settings.ci) {
    return;
  }

  let databaseName: string;
  try {
    databaseName = new URL(settings.databaseUrl).pathname.slice(1);
  } catch {
    throw new Error("Automated checks require a valid disposable PostgreSQL database URL");
  }

  if (!/(^|[_-])test($|[_-])/.test(databaseName)) {
    throw new Error(
      `Automated checks require a disposable PostgreSQL database with "test" in its name; received "${databaseName}"`,
    );
  }
}
