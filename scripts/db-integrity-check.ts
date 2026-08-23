#!/usr/bin/env tsx
/**
 * Read-only post-deploy database integrity verification.
 * Run: npm run db:integrity:verify
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { runDatabaseIntegrityVerification } from "../src/lib/db/integrity-verification";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("FAIL — DATABASE_URL is not configured.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await runDatabaseIntegrityVerification(prisma);
    console.log("Database integrity verification (read-only)");
    for (const check of result.checks) {
      console.log(
        `  ${check.ok ? "PASS" : "FAIL"} — ${check.name}: anomalies=${check.anomalyCount}`
      );
    }
    console.log(`  tableCounts: ${JSON.stringify(result.tableCounts)}`);
    console.log(
      result.ok ? "PASS — database integrity" : "FAIL — database integrity anomalies detected"
    );
    process.exit(result.ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("FAIL — database integrity:", error instanceof Error ? error.message : "unknown");
  process.exit(1);
});
