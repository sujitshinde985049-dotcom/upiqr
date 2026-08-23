/**
 * Guards mutating verification scripts from running against production runtime.
 * Does not infer production from hostname — uses explicit runtime configuration only.
 */
export class TestDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDatabaseGuardError";
  }
}

/**
 * Block mutating DB verification when NODE_ENV=production unless explicitly overridden.
 * Set DB_PRODUCTION_GUARD=true to block even in non-production NODE_ENV when needed.
 */
export function assertSafeTestDatabase(): void {
  if (process.env.DB_PRODUCTION_GUARD === "true") {
    throw new TestDatabaseGuardError(
      "DB_PRODUCTION_GUARD is enabled. Mutating database verification is blocked."
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DB_TEST_MUTATIONS !== "true"
  ) {
    throw new TestDatabaseGuardError(
      "Mutating database verification is blocked when NODE_ENV=production. Use a non-production database for verification suites."
    );
  }
}

export function getTestDatabaseGuardSummary(): {
  nodeEnv: string | undefined;
  productionGuard: boolean;
  allowMutations: boolean;
} {
  return {
    nodeEnv: process.env.NODE_ENV,
    productionGuard: process.env.DB_PRODUCTION_GUARD === "true",
    allowMutations: process.env.ALLOW_DB_TEST_MUTATIONS === "true",
  };
}
