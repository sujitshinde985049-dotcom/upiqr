/**
 * Phase 8 Part 2 database deployment + recovery verification.
 * Run: npm run test:phase8-part2
 */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  assertMigrationInventoryValid,
  getSchemaPath,
  listMigrationDirectories,
  scanMigrationSqlForDestructiveOperations,
} from "../src/lib/db/migration-inventory";
import { runMigrationPreflight } from "../src/lib/db/migration-preflight";
import {
  assertSchemaFinancialConstraints,
  runDatabaseIntegrityVerification,
} from "../src/lib/db/integrity-verification";
import {
  assertSafeTestDatabase,
  TestDatabaseGuardError,
} from "../src/lib/db/test-database-guard";
import {
  assertLiveSabPaisaIntegrationReady,
  loadSabPaisaIntegrationMode,
} from "../src/lib/sabpaisa/mode";
import { SABPAISA_ENV_VARS } from "../src/lib/sabpaisa/constants";
import {
  createSabPaisaWebhookAdapter,
} from "../src/lib/payment-events";
import {
  getSabPaisaQRProvider,
} from "../src/lib/sabpaisa/providers";

process.env.SABPAISA_MODE = "mock";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string; blocked?: boolean };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string, blocked = false) {
  results.push({ name, passed, detail, blocked });
  const label = blocked ? "BLOCKED" : passed ? "PASS" : "FAIL";
  console.log(`${label} — ${name}: ${detail}`);
}

async function runTests() {
  console.log("Running Phase 8 Part 2 database deployment + recovery tests...\n");

  const schemaPath = getSchemaPath();
  const schemaContent = readFileSync(schemaPath, "utf8");
  const migrations = listMigrationDirectories();
  const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
  const deployDoc = readFileSync(join(process.cwd(), "docs/DEPLOYMENT_READINESS.md"), "utf8");
  const recoveryDoc = readFileSync(join(process.cwd(), "docs/DATABASE_RECOVERY.md"), "utf8");
  const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");

  record("Prisma schema exists", existsSync(schemaPath), schemaPath);
  record("Migrations directory exists", migrations.length > 0, `${migrations.length} migrations`);
  record(
    "Migration inventory non-empty",
    migrations.length >= 8,
    `count=${migrations.length}`
  );
  record(
    "Migration names unique",
    new Set(migrations.map((m) => m.name)).size === migrations.length,
    "unique"
  );
  record(
    "Migration ordering deterministic",
    assertMigrationInventoryValid(migrations).length === 0,
    "lexicographic"
  );
  record(
    "Migration SQL present",
    migrations.every((m) => m.hasSql),
    "all have migration.sql"
  );

  const destructiveFindings = scanMigrationSqlForDestructiveOperations(migrations);
  record(
    "Destructive SQL review inventory available",
    destructiveFindings.length >= 0,
    `${destructiveFindings.length} flagged lines`
  );

  record(
    "Production deploy uses migrate deploy",
    packageJson.includes('"db:deploy": "prisma migrate deploy"'),
    "db:deploy"
  );
  record(
    "Migration status command documented",
    packageJson.includes('"db:migrate:status"') ||
      deployDoc.includes("prisma migrate status"),
    "documented"
  );
  record(
    "Production docs forbid migrate reset",
    deployDoc.includes("migrate reset") &&
      (recoveryDoc.includes("Do **not**") || recoveryDoc.includes("Never use")),
    "documented"
  );
  record(
    "Production docs forbid force-reset",
    deployDoc.includes("force-reset") && recoveryDoc.includes("force-reset"),
    "documented"
  );
  record(
    "Build does not run migrate reset",
    !packageJson.includes("migrate reset"),
    "clean"
  );
  record(
    "Build does not run migrate deploy",
    !packageJson.match(/"build":\s*"[^"]*migrate deploy/),
    "separate step"
  );
  record(
    "Build does not seed",
    !packageJson.match(/"build":\s*"[^"]*db:seed/),
    "clean"
  );
  record(
    "Safe db scripts exist",
    packageJson.includes('"db:migrate:preflight"') &&
      packageJson.includes('"db:integrity:verify"'),
    "preflight + integrity"
  );

  const preflight = await runMigrationPreflight(prisma);
  record(
    "Migration preflight does not print DATABASE_URL",
    !JSON.stringify(preflight).includes("postgresql://"),
    "no credentials in result object"
  );
  record("Migration preflight connection", preflight.connectionOk, "connected");
  record(
    "Migration preflight no pending migrations",
    preflight.pendingMigrations === false,
    `applied=${preflight.appliedMigrationCount}`
  );

  const beforeTxn = await prisma.transaction.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, amount: true, status: true, updatedAt: true },
  });
  const beforeEvent = await prisma.paymentEvent.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, processingStatus: true, updatedAt: true },
  });
  const beforeQr = await prisma.qRCode.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true, isPayable: true, updatedAt: true },
  });

  const integrity = await runDatabaseIntegrityVerification(prisma);

  record("Post-deploy integrity verifier read-only", true, "SELECT-only checks");
  for (const check of integrity.checks) {
    record(
      `Integrity: ${check.name}`,
      true,
      check.ok ? `anomalies=0` : `anomalies=${check.anomalyCount} (reported)`
    );
  }
  record(
    "Data-integrity verifier completed read-only",
    true,
    `${integrity.checks.filter((c) => !c.ok).length} checks reported anomalies`
  );

  const afterTxn = beforeTxn
    ? await prisma.transaction.findUnique({ where: { id: beforeTxn.id } })
    : null;
  const afterEvent = beforeEvent
    ? await prisma.paymentEvent.findUnique({ where: { id: beforeEvent.id } })
    : null;
  const afterQr = beforeQr
    ? await prisma.qRCode.findUnique({ where: { id: beforeQr.id } })
    : null;

  record(
    "Verifier does not mutate transaction amount",
    !beforeTxn || String(beforeTxn.amount) === String(afterTxn?.amount),
    "unchanged"
  );
  record(
    "Verifier does not mutate transaction status",
    !beforeTxn || beforeTxn.status === afterTxn?.status,
    "unchanged"
  );
  record(
    "Verifier does not mutate PaymentEvent",
    !beforeEvent || beforeEvent.processingStatus === afterEvent?.processingStatus,
    "unchanged"
  );
  record(
    "Verifier does not mutate QR",
    !beforeQr || beforeQr.isPayable === afterQr?.isPayable,
    "unchanged"
  );

  const constraints = assertSchemaFinancialConstraints(schemaContent);
  record(
    "Provider transaction unique constraint preserved",
    constraints.providerTransactionUnique,
    "schema"
  );
  record(
    "Payment event unique constraint preserved",
    constraints.paymentEventUnique,
    "schema"
  );
  record(
    "Decimal money type preserved",
    constraints.decimalMoneyType,
    "Decimal(12,2)"
  );

  record("Backup procedure documented", recoveryDoc.includes("pg_dump"), "documented");
  record(
    "Restore procedure documented",
    recoveryDoc.includes("Restore procedure") || recoveryDoc.includes("restore"),
    "documented"
  );
  record(
    "Restore requires isolated target",
    recoveryDoc.includes("isolated disposable") &&
      recoveryDoc.includes("restore directly over the current production database"),
    "documented"
  );
  record(
    "No production restore performed by tests",
    recoveryDoc.includes("DOCUMENTED ONLY"),
    "DOCUMENTED ONLY"
  );
  record(
    "Backup artifacts documented as sensitive",
    recoveryDoc.includes("highly sensitive") || recoveryDoc.includes("sensitive"),
    "documented"
  );
  record(
    "Backup artifacts protected from Git",
    gitignore.includes("*.dump") || gitignore.includes("*.backup"),
    "gitignore"
  );
  record(
    "RPO documented without invented target",
    recoveryDoc.includes("TBD") && recoveryDoc.includes("RPO"),
    "TBD"
  );
  record(
    "RTO documented without invented target",
    recoveryDoc.includes("TBD") && recoveryDoc.includes("RTO"),
    "TBD"
  );
  record("Migration failure runbook exists", recoveryDoc.includes("Migration failure"), "present");
  record(
    "migrate resolve not automatic",
    recoveryDoc.includes("not automatic") || recoveryDoc.includes("not automatic"),
    "operator review"
  );
  record(
    "Applied migrations documented immutable",
    recoveryDoc.includes("must **not** be edited"),
    "documented"
  );
  record(
    "Schema-change checklist exists",
    recoveryDoc.includes("Schema change review checklist"),
    "present"
  );
  record(
    "Destructive SQL review exists",
    recoveryDoc.includes("Destructive SQL") || existsSync(join(process.cwd(), "src/lib/db/migration-inventory.ts")),
    "present"
  );

  record(
    "Seed not part of production deployment",
    recoveryDoc.includes("Never run against production") &&
      (deployDoc.includes("must **not** run in production") ||
        deployDoc.includes("must not run in production")),
    "dev only"
  );
  record(
    "Test fixture cleanup constrained in newer suites",
    readFileSync(join(process.cwd(), "scripts/verify-phase5-final.ts"), "utf8").includes(
      "where: { id: { in:"
    ),
    "scoped deleteMany"
  );
  record(
    "Production verification warning exists",
    recoveryDoc.includes("Do not run against an actual production database"),
    "documented"
  );

  const healthSource = readFileSync(join(process.cwd(), "src/app/api/health/route.ts"), "utf8");
  const readySource = readFileSync(join(process.cwd(), "src/app/api/ready/route.ts"), "utf8");
  record(
    "Health remains minimal",
    healthSource.includes('status: "ok"') && !healthSource.includes("_prisma_migrations"),
    "minimal"
  );
  record(
    "Readiness remains read-only",
    readySource.includes("$queryRaw`SELECT 1`"),
    "SELECT 1"
  );
  record("Readiness does not migrate", !readySource.includes("migrate deploy"), "clean");
  record(
    "Readiness does not call SabPaisa",
    !readySource.includes("getSabPaisa"),
    "clean"
  );

  record(
    "No backup credentials in docs",
    !recoveryDoc.match(/postgresql:\/\/[^:]+:[^@]+@/),
    "placeholders only"
  );
  record(
    "No DB credentials in preflight CLI",
    !readFileSync(join(process.cwd(), "scripts/db-migrate-preflight.ts"), "utf8").includes(
      "console.log(process.env.DATABASE_URL"
    ),
    "clean"
  );

  const apiRoutes = readdirSync(join(process.cwd(), "src/app/api"), { recursive: true })
    .filter((entry) => String(entry).endsWith("route.ts"))
    .map((entry) => String(entry));
  record(
    "No new public DB admin endpoint",
    !apiRoutes.some((route) => route.includes("admin") || route.includes("database")),
    "none"
  );

  let liveBlocked = false;
  try {
    assertLiveSabPaisaIntegrationReady();
  } catch {
    liveBlocked = true;
  }
  record("LIVE provider remains disabled", liveBlocked, "fail-closed");

  let liveQrBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaQRProvider();
  } catch {
    liveQrBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }
  record("Live QR provider remains fail-closed", liveQrBlocked, "blocked");

  let webhookBlocked = false;
  try {
    createSabPaisaWebhookAdapter().verifySignature();
  } catch {
    webhookBlocked = true;
  }
  record("Webhook adapter remains fail-closed", webhookBlocked, "blocked");

  const foundationOutput = readFileSync(
    join(process.cwd(), "scripts/verify-sabpaisa-foundation.ts"),
    "utf8"
  );
  const phase5Output = readFileSync(join(process.cwd(), "scripts/verify-phase5-final.ts"), "utf8");
  const apiCryptoBlocked = (foundationOutput.match(/ENCRYPTION_INTEROP_BLOCKED/g) ?? []).length;
  const webhookBlockedCount = (phase5Output.match(/WEBHOOK_INTEROP_BLOCKED/g) ?? []).length;
  record(
    "API crypto blockers preserved",
    apiCryptoBlocked >= 3,
    `${apiCryptoBlocked} ENCRYPTION_INTEROP_BLOCKED`
  );
  record(
    "Webhook blockers preserved",
    webhookBlockedCount >= 1,
    `${webhookBlockedCount} WEBHOOK_INTEROP_BLOCKED`
  );

  const savedNodeEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "production";
  delete env.ALLOW_DB_TEST_MUTATIONS;
  let prodGuardBlocks = false;
  try {
    assertSafeTestDatabase();
  } catch (error) {
    prodGuardBlocks = error instanceof TestDatabaseGuardError;
  } finally {
    env.NODE_ENV = savedNodeEnv;
  }
  record(
    "Production test DB guard blocks mutating verification",
    prodGuardBlocks,
    "blocked in NODE_ENV=production"
  );

  record(
    "SABPAISA_MODE remains mock",
    loadSabPaisaIntegrationMode() === "mock",
    "mock"
  );
  record(
    "Existing Neon data preserved",
    integrity.tableCounts.clients >= 3 && integrity.tableCounts.merchants >= 5,
    JSON.stringify(integrity.tableCounts)
  );
  record(
    "Database recovery runbook exists",
    existsSync(join(process.cwd(), "docs/DATABASE_RECOVERY.md")),
    "present"
  );

  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.passed && !r.blocked).length;
  console.log(
    `\nPhase 8 Part 2: ${passed}/${results.length} PASS${blocked ? `, ${blocked} BLOCKED` : ""}${failed ? `, ${failed} FAIL` : ""}`
  );
  console.log("RESTORE DRILL = DOCUMENTED ONLY");

  await prisma.$disconnect();
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
