export function assertSafeTestDatabaseUrl(connectionString: string): {
  database: string;
  username: string;
  host: string;
};

export function assertActualTestDatabase(
  row: { database?: string; username?: string } | undefined,
  expected: { database: string; username: string },
): void;
