export interface AutomatedDatabaseSettings {
  databaseUrl: string;
  nodeEnv: string;
  ci: boolean;
  disposableDatabaseAcknowledged: boolean;
}

export function assertSafeAutomatedDatabase(settings: AutomatedDatabaseSettings): void;
