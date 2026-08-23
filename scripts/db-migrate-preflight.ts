#!/usr/bin/env tsx
/**
 * Read-only migration deployment preflight.
 * Run: npm run db:migrate:preflight
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { runMigrationPreflight } from "../src/lib/db/migration-preflight";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("FAIL — DATABASE_URL is not configured.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await runMigrationPreflight(prisma);
    console.log("Migration preflight");
    console.log(`  databaseUrlConfigured: ${result.databaseUrlConfigured}`);
    console.log(`  schemaExists: ${result.schemaExists}`);
    console.log(`  migrationsDirectoryExists: ${result.migrationsDirectoryExists}`);
    console.log(`  migrationCount: ${result.migrationCount}`);
    console.log(`  connectionOk: ${result.connectionOk}`);
    console.log(`  appliedMigrationCount: ${result.appliedMigrationCount ?? "unknown"}`);
    console.log(`  pendingMigrations: ${result.pendingMigrations ?? "unknown"}`);
    console.log(`  destructiveSqlFindings: ${result.destructiveSqlFindings.length}`);

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`  error: ${error}`);
      }
    }

    console.log(result.ok ? "PASS — migration preflight" : "FAIL — migration preflight");
    process.exit(result.ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("FAIL — migration preflight:", error instanceof Error ? error.message : "unknown");
  process.exit(1);
});
