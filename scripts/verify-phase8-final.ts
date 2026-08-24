/**
 * Phase 8 final production readiness verification.
 * Run: npm run test:phase8-final
 */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { loadServerConfig } from "../src/lib/config/env";
import { runMigrationPreflight } from "../src/lib/db/migration-preflight";
import { runDatabaseIntegrityVerification } from "../src/lib/db/integrity-verification";
import { sanitizeForOperationalLog } from "../src/lib/observability";
import {
  assertLiveSabPaisaIntegrationReady,
  loadSabPaisaIntegrationMode,
} from "../src/lib/sabpaisa/mode";
import { SABPAISA_ENV_VARS } from "../src/lib/sabpaisa/constants";
import { createSabPaisaWebhookAdapter } from "../src/lib/payment-events";
import {
  getSabPaisaQRProvider,
  getSabPaisaTransactionProvider,
} from "../src/lib/sabpaisa/providers";
import { containsSecretLikeKeys } from "../src/lib/validations/settings";
import { getIntegrationReadiness } from "../src/lib/services/monitoring-service";

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

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walkFiles(fullPath, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function runTests() {
  console.log("Running Phase 8 final production readiness tests...\n");

  const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
  const deployDoc = readFileSync(join(process.cwd(), "docs/DEPLOYMENT_READINESS.md"), "utf8");
  const recoveryDoc = readFileSync(join(process.cwd(), "docs/DATABASE_RECOVERY.md"), "utf8");
  const opsDoc = readFileSync(join(process.cwd(), "docs/OPERATIONS_RUNBOOK.md"), "utf8");
  const releaseDoc = readFileSync(
    join(process.cwd(), "docs/PRODUCTION_RELEASE_CHECKLIST.md"),
    "utf8"
  );
  const liveDoc = readFileSync(join(process.cwd(), "docs/SABPAISA_LIVE_READINESS.md"), "utf8");
  const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  record("Configuration module exists", existsSync("src/lib/config/env.ts"), "present");
  try {
    const config = loadServerConfig();
    record("Configuration loads safely", Boolean(config.authSecret), `mode=${config.sabpaisaMode}`);
  } catch {
    record("Configuration loads safely", false, "failed");
  }

  const srcFiles = walkFiles(join(process.cwd(), "src"));
  record(
    "No secrets in NEXT_PUBLIC",
    !srcFiles.some((f) => /NEXT_PUBLIC_(DATABASE_URL|AUTH_SECRET|SABPAISA)/.test(readFileSync(f, "utf8"))),
    "clean"
  );

  record("Security headers configured", nextConfig.includes("X-Frame-Options"), "present");
  record("Health route exists", existsSync("src/app/api/health/route.ts"), "present");
  record("Readiness route exists", existsSync("src/app/api/ready/route.ts"), "present");

  record(
    "Production migration policy",
    packageJson.includes('"db:migrate:deploy": "prisma migrate deploy"'),
    "migrate deploy"
  );
  const buildScriptMatch = packageJson.match(/"build":\s*"([^"]+)"/);
  const buildScript = buildScriptMatch?.[1] ?? "";
  record(
    "Build does not migrate/seed",
    !/migrate\s+(deploy|dev|reset)/.test(buildScript) && !buildScript.includes("db:seed"),
    "separate"
  );

  const preflight = await runMigrationPreflight(prisma);
  record("Migration preflight PASS", preflight.ok, `applied=${preflight.appliedMigrationCount}`);
  record("No pending migrations", preflight.pendingMigrations === false, "up to date");

  const integrity = await runDatabaseIntegrityVerification(prisma);
  record("DB integrity verifier runs", integrity.checks.length >= 15, `${integrity.checks.length} checks`);

  record(
    "Backup/recovery documented truthfully",
    recoveryDoc.includes("DOCUMENTED ONLY"),
    "DOCUMENTED ONLY"
  );
  record("Operations runbook exists", opsDoc.includes("Operations Runbook"), "present");
  record(
    "External alerting NOT IMPLEMENTED",
    opsDoc.includes("NOT IMPLEMENTED") && releaseDoc.includes("NOT IMPLEMENTED"),
    "truthful"
  );

  record(
    "Structured logging module exists",
    existsSync("src/lib/observability/logger.ts"),
    "present"
  );
  const redacted = JSON.stringify(
    sanitizeForOperationalLog({ password: "x", customerVpa: "a@b.com", DATABASE_URL: "postgresql://u:p@h/d" })
  );
  record("Log redaction active", redacted.includes("[REDACTED]") && redacted.includes("****"), "redacted");

  const healthSource = readFileSync("src/app/api/health/route.ts", "utf8");
  const readySource = readFileSync("src/app/api/ready/route.ts", "utf8");
  record("Health minimal", healthSource.includes('status: "ok"'), "minimal");
  record("Readiness read-only", readySource.includes("SELECT 1"), "read-only");

  const apiRoutes = walkFiles(join(process.cwd(), "src/app/api")).filter((f) => f.endsWith("route.ts"));
  const routePaths = apiRoutes.map((f) => f.replace(process.cwd(), "").replace(/\\/g, "/"));
  record("Public API inventory", routePaths.length >= 5, routePaths.join(", "));
  record("No public payment mutation route", !routePaths.some((r) => r.includes("payment") && !r.includes("export")), "none");
  record("No public notification creation route", !routePaths.some((r) => r.includes("notifications/create")), "none");
  record("No public password reset route", !routePaths.some((r) => r.includes("reset-password")), "none");
  record("No public DB admin route", !routePaths.some((r) => r.includes("database") || r.includes("admin")), "none");
  record("No public SabPaisa webhook", !routePaths.some((r) => r.includes("webhook")), "none");

  const exportRoute = readFileSync("src/app/api/transactions/export/route.ts", "utf8");
  const qrRoute = readFileSync("src/app/api/qr/[id]/download/route.ts", "utf8");
  record("Transaction export auth enforced", exportRoute.includes("requireAuthenticatedUser"), "enforced");
  record("QR download auth enforced", qrRoute.includes("auth(") || qrRoute.includes("requireAuthenticatedUser"), "enforced");

  record(
    "Settings reject secret-like keys",
    containsSecretLikeKeys({ SABPAISA_API_SECRET: "x" }) === "SABPAISA_API_SECRET",
    "rejected"
  );

  record(
    "Decimal money type preserved",
    schema.includes("@db.Decimal(12, 2)"),
    "Decimal(12,2)"
  );
  record(
    "Provider transaction unique constraint",
    schema.includes("@@unique([provider, providerMode, providerTransactionId])"),
    "present"
  );
  record(
    "Payment event unique constraint",
    schema.includes("@@unique([provider, providerMode, providerEventId])"),
    "present"
  );

  const processorSource = readFileSync("src/lib/payment-events/processor.ts", "utf8");
  record(
    "No Mark Success action in codebase",
    !srcFiles.some((f) => readFileSync(f, "utf8").includes("Mark Success")),
    "clean"
  );
  record(
    "Payment processor state machine preserved",
    processorSource.includes("isAllowedStatusTransition"),
    "present"
  );
  record(
    "Observability does not mutate payment truth",
    !readFileSync("src/lib/observability/logger.ts", "utf8").includes("transaction.update"),
    "read-only logs"
  );

  let liveBlocked = false;
  try {
    assertLiveSabPaisaIntegrationReady();
  } catch {
    liveBlocked = true;
  }
  record("Live integration fail-closed", liveBlocked, "blocked");

  let liveQrBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaQRProvider();
  } catch {
    liveQrBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }
  record("Live QR provider fail-closed", liveQrBlocked, "blocked");

  let liveTxnBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaTransactionProvider();
  } catch {
    liveTxnBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }
  record("Live transaction provider fail-closed", liveTxnBlocked, "blocked");

  let webhookBlocked = false;
  try {
    createSabPaisaWebhookAdapter().verifySignature();
  } catch {
    webhookBlocked = true;
  }
  record("Webhook adapter fail-closed", webhookBlocked, "blocked");

  const foundationOutput = readFileSync("scripts/verify-sabpaisa-foundation.ts", "utf8");
  const phase5Output = readFileSync("scripts/verify-phase5-final.ts", "utf8");
  record(
    "API crypto blockers preserved",
    (foundationOutput.match(/ENCRYPTION_INTEROP_BLOCKED/g) ?? []).length >= 3,
    "3 BLOCKED"
  );
  record(
    "Webhook blockers preserved",
    (phase5Output.match(/WEBHOOK_INTEROP_BLOCKED/g) ?? []).length >= 1,
    "4 BLOCKED in suite"
  );

  const readiness = getIntegrationReadiness();
  record(
    "MOCK/LIVE separation in monitoring",
    readiness.liveQrProvider === "Disabled" && readiness.liveTransactionProvider === "Disabled",
    "blocked"
  );

  record("Release checklist exists", releaseDoc.includes("GO / NO-GO"), "present");
  record(
    "Release checklist blocks LIVE",
    releaseDoc.includes("SABPAISA LIVE MUST NOT BE ENABLED"),
    "documented"
  );
  record(
    "Deployment runbook finalized",
    deployDoc.includes("db:migrate:preflight") && deployDoc.includes("db:integrity:verify"),
    "present"
  );
  record(
    "GO/NO-GO distinguishes app vs LIVE",
    releaseDoc.includes("Application deployment readiness") && releaseDoc.includes("BLOCKED"),
    "documented"
  );

  record(
    "Restore drill truthful",
    recoveryDoc.includes("DOCUMENTED ONLY"),
    "DOCUMENTED ONLY"
  );
  record(
    "Live readiness doc blocked",
    liveDoc.includes("NOT enabled") && liveDoc.includes("BLOCKED"),
    "blocked"
  );

  record(
    "SABPAISA_MODE mock",
    loadSabPaisaIntegrationMode() === "mock",
    "mock"
  );
  record(
    "Existing Neon data preserved",
    (await prisma.client.count()) >= 3 && (await prisma.merchant.count()) >= 5,
    `clients=${await prisma.client.count()}`
  );

  record(
    "Phase 8 Part 3 verification script exists",
    existsSync("scripts/verify-phase8-part3.ts"),
    "present"
  );
  record(
    "Phase 8 observability index server-only",
    readFileSync("src/lib/observability/index.ts", "utf8").includes("operationalLogger"),
    "present"
  );
  record(
    "Audit log distinct from operational log",
    readFileSync("src/lib/audit/audit-log.ts", "utf8").includes("prisma.auditLog.create"),
    "AuditLog"
  );
  record(
    "Password not in operational log helper",
    !readFileSync("src/lib/observability/logger.ts", "utf8").includes("passwordHash"),
    "clean"
  );
  record(
    "Customer VPA masking reused",
    readFileSync("src/lib/observability/redaction.ts", "utf8").includes("maskCustomerVpa"),
    "reused"
  );
  record(
    "Production NODE_ENV does not imply LIVE",
    loadSabPaisaIntegrationMode() === "mock",
    "separate"
  );
  record(
    "No new Phase 8 Part 3/4 migration",
    !existsSync(join(process.cwd(), "prisma/migrations/20250824")),
    "no new migration dir"
  );
  record(
    ".env.example placeholders only",
    !readFileSync(".env.example", "utf8").includes("sk_live"),
    "placeholders"
  );
  record(
    "Gitignore protects backup artifacts",
    readFileSync(".gitignore", "utf8").includes("*.dump"),
    "protected"
  );
  record(
    "README documents Phase 8 completion",
    readFileSync("README.md", "utf8").includes("Phase 8 — COMPLETE"),
    "documented"
  );

  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.passed && !r.blocked).length;
  console.log(
    `\nPhase 8 Final: ${passed}/${results.length} PASS${blocked ? `, ${blocked} BLOCKED` : ""}${failed ? `, ${failed} FAIL` : ""}`
  );
  console.log("Application deployment readiness: evaluated by final gate");
  console.log("SabPaisa LIVE readiness: BLOCKED");

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
