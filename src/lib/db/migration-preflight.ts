import { PrismaClient } from "@prisma/client";
import {
  assertMigrationInventoryValid,
  getSchemaPath,
  listMigrationDirectories,
  scanMigrationSqlForDestructiveOperations,
} from "./migration-inventory";

export type MigrationPreflightResult = {
  ok: boolean;
  databaseUrlConfigured: boolean;
  schemaExists: boolean;
  migrationsDirectoryExists: boolean;
  migrationCount: number;
  migrationIssues: string[];
  destructiveSqlFindings: ReturnType<typeof scanMigrationSqlForDestructiveOperations>;
  connectionOk: boolean;
  appliedMigrationCount: number | null;
  pendingMigrations: boolean | null;
  errors: string[];
};

type AppliedMigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export async function runMigrationPreflight(
  prisma: PrismaClient
): Promise<MigrationPreflightResult> {
  const errors: string[] = [];
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const schemaExists = Boolean(getSchemaPath());
  const entries = listMigrationDirectories();
  const migrationsDirectoryExists = entries.length > 0;
  const migrationIssues = assertMigrationInventoryValid(entries);
  const destructiveSqlFindings = scanMigrationSqlForDestructiveOperations(entries);

  let connectionOk = false;
  let appliedMigrationCount: number | null = null;
  let pendingMigrations: boolean | null = null;

  if (!databaseUrlConfigured) {
    errors.push("DATABASE_URL is not configured.");
  }

  if (!schemaExists) {
    errors.push("Prisma schema file is missing.");
  }

  if (migrationIssues.length > 0) {
    errors.push(...migrationIssues);
  }

  if (databaseUrlConfigured) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      connectionOk = true;
    } catch {
      errors.push("Database connection failed.");
    }
  }

  if (connectionOk) {
    try {
      const applied = await prisma.$queryRaw<AppliedMigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations"
        ORDER BY migration_name
      `;
      const successful = applied.filter(
        (row) => row.finished_at && !row.rolled_back_at
      );
      appliedMigrationCount = successful.length;
      pendingMigrations = successful.length < entries.length;
    } catch {
      errors.push("Unable to read Prisma migration history.");
    }
  }

  const ok =
    databaseUrlConfigured &&
    schemaExists &&
    migrationsDirectoryExists &&
    migrationIssues.length === 0 &&
    connectionOk &&
    pendingMigrations !== true &&
    errors.length === 0;

  return {
    ok,
    databaseUrlConfigured,
    schemaExists,
    migrationsDirectoryExists,
    migrationCount: entries.length,
    migrationIssues,
    destructiveSqlFindings,
    connectionOk,
    appliedMigrationCount,
    pendingMigrations,
    errors,
  };
}
