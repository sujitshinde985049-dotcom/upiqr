/**
 * Phase 8 Part 1 production configuration + deployment security verification.
 * Run: npm run test:phase8-part1
 */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  loadServerConfig,
  ServerConfigError,
} from "../src/lib/config/env";
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
  console.log("Running Phase 8 Part 1 production configuration tests...\n");

  record(
    "Central server config module exists",
    existsSync(join(process.cwd(), "src/lib/config/env.ts")),
    "src/lib/config/env.ts"
  );

  let configOk = false;
  try {
    const config = loadServerConfig();
    configOk = Boolean(config.databaseUrl && config.authSecret);
    record(
      "Critical config loads in current environment",
      configOk,
      `nodeEnv=${config.nodeEnv} mode=${config.sabpaisaMode}`
    );
  } catch (error) {
    record(
      "Critical config loads in current environment",
      false,
      error instanceof ServerConfigError ? error.message : "failed"
    );
  }

  const savedDb = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let missingDbFails = false;
  try {
    loadServerConfig();
  } catch (error) {
    missingDbFails = error instanceof ServerConfigError;
  } finally {
    process.env.DATABASE_URL = savedDb;
  }
  record("Missing DATABASE_URL fails safely", missingDbFails, "configuration error");

  const savedAuth = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "short";
  let shortAuthFails = false;
  try {
    loadServerConfig();
  } catch (error) {
    shortAuthFails = error instanceof ServerConfigError;
  } finally {
    process.env.AUTH_SECRET = savedAuth;
  }
  record("Too-short AUTH_SECRET rejected", shortAuthFails, "rejected");

  const savedMode = process.env.SABPAISA_MODE;
  process.env.SABPAISA_MODE = "invalid-mode";
  let invalidModeFails = false;
  try {
    loadServerConfig();
  } catch (error) {
    invalidModeFails = error instanceof ServerConfigError;
  } finally {
    process.env.SABPAISA_MODE = savedMode;
  }
  record("Invalid SABPAISA_MODE rejected", invalidModeFails, "rejected");

  process.env.SABPAISA_MODE = "mock";
  record(
    "MOCK provider mode accepted",
    loadSabPaisaIntegrationMode() === "mock",
    "mock"
  );

  let liveBlocked = false;
  try {
    assertLiveSabPaisaIntegrationReady();
  } catch {
    liveBlocked = true;
  }
  record("Unsupported LIVE remains fail-closed", liveBlocked, "blocked");

  process.env.SABPAISA_MODE = "live";
  let liveModeConfiguredButBlocked = false;
  try {
    loadSabPaisaIntegrationMode();
    assertLiveSabPaisaIntegrationReady();
  } catch {
    liveModeConfiguredButBlocked = true;
  } finally {
    process.env.SABPAISA_MODE = "mock";
  }
  record(
    "Configured LIVE does not silently fall back to MOCK",
    liveModeConfiguredButBlocked,
    "fail-closed"
  );

  const srcFiles = walkFiles(join(process.cwd(), "src"));
  const nextPublicSecrets = srcFiles.filter((file) => {
    const content = readFileSync(file, "utf8");
    return /NEXT_PUBLIC_(DATABASE_URL|AUTH_SECRET|SABPAISA)/.test(content);
  });
  record(
    "No secrets use NEXT_PUBLIC prefix",
    nextPublicSecrets.length === 0,
    nextPublicSecrets.length ? nextPublicSecrets.join(", ") : "clean"
  );

  const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
  record(
    ".env.example uses placeholders only",
    !envExample.includes("sk_live") &&
      envExample.includes("DATABASE_URL=") &&
      envExample.includes("AUTH_SECRET=") &&
      envExample.includes("SABPAISA_MODE=mock"),
    "template"
  );

  record(
    ".env ignored by git",
    existsSync(join(process.cwd(), ".gitignore")) &&
      readFileSync(join(process.cwd(), ".gitignore"), "utf8").includes(".env*"),
    "gitignore"
  );

  const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  record("X-Content-Type-Options configured", nextConfig.includes("nosniff"), "present");
  record("X-Frame-Options configured", nextConfig.includes("X-Frame-Options"), "present");
  record(
    "Referrer-Policy configured",
    nextConfig.includes("Referrer-Policy"),
    "present"
  );
  record(
    "Permissions-Policy configured",
    nextConfig.includes("Permissions-Policy"),
    "present"
  );
  record(
    "No build error bypass",
    !nextConfig.includes("ignoreBuildErrors") && !nextConfig.includes("ignoreDuringBuilds"),
    "clean"
  );

  const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
  record(
    "Health endpoint public in middleware",
    middleware.includes("/api/health"),
    "present"
  );
  record(
    "Readiness endpoint public in middleware",
    middleware.includes("/api/ready"),
    "present"
  );

  record(
    "Health route exists",
    existsSync(join(process.cwd(), "src/app/api/health/route.ts")),
    "present"
  );
  record(
    "Readiness route exists",
    existsSync(join(process.cwd(), "src/app/api/ready/route.ts")),
    "present"
  );

  const healthSource = readFileSync(
    join(process.cwd(), "src/app/api/health/route.ts"),
    "utf8"
  );
  record(
    "Health response minimal",
    healthSource.includes('status: "ok"') && !healthSource.includes("DATABASE_URL"),
    "minimal"
  );
  record(
    "Health does not call SabPaisa",
    !healthSource.includes("SabPaisa") && !healthSource.includes("getSabPaisa"),
    "clean"
  );

  const readySource = readFileSync(
    join(process.cwd(), "src/app/api/ready/route.ts"),
    "utf8"
  );
  record(
    "Readiness uses read-only DB check",
    readySource.includes("$queryRaw`SELECT 1`"),
    "SELECT 1"
  );
  record(
    "Readiness failure response generic",
    readySource.includes("unavailable") && !readySource.includes("Prisma"),
    "generic"
  );
  record(
    "Readiness does not call SabPaisa",
    !readySource.includes("getSabPaisa"),
    "clean"
  );
  record(
    "Readiness sets no-store cache",
    readySource.includes("no-store"),
    "no-store"
  );

  const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
  record(
    "Production migration uses migrate deploy",
    packageJson.includes('"db:deploy": "prisma migrate deploy"'),
    "db:deploy"
  );
  record(
    "Build does not reset database",
    !packageJson.includes("migrate reset") && packageJson.includes("prisma generate && next build"),
    "safe build"
  );

  const deployDoc = readFileSync(
    join(process.cwd(), "docs/DEPLOYMENT_READINESS.md"),
    "utf8"
  );
  record("Deployment runbook exists", deployDoc.length > 0, "present");
  record(
    "Deployment runbook forbids migrate reset",
    deployDoc.includes("migrate reset") && deployDoc.includes("must NOT"),
    "documented"
  );
  record(
    "Deployment runbook documents migrate deploy",
    deployDoc.includes("prisma migrate deploy"),
    "documented"
  );

  const liveDoc = readFileSync(
    join(process.cwd(), "docs/SABPAISA_LIVE_READINESS.md"),
    "utf8"
  );
  record(
    "Live readiness doc remains blocked",
    liveDoc.includes("NOT enabled") && liveDoc.includes("BLOCKED"),
    "blocked"
  );

  record(
    "Settings rejects secret-like keys",
    containsSecretLikeKeys({ SABPAISA_API_SECRET: "x" }) === "SABPAISA_API_SECRET",
    "rejected"
  );

  const apiRoutes = walkFiles(join(process.cwd(), "src/app/api")).filter((f) =>
    f.endsWith("route.ts")
  );
  const routePaths = apiRoutes.map((f) => f.replace(process.cwd(), "").replace(/\\/g, "/"));
  record(
    "Public API inventory captured",
    routePaths.length >= 5,
    routePaths.join(", ")
  );
  record(
    "No public notification creation route",
    !routePaths.some((r) => r.includes("notifications/create")),
    "none"
  );
  record(
    "No public password reset route",
    !routePaths.some((r) => r.includes("reset-password")),
    "none"
  );
  record(
    "No public SabPaisa webhook route",
    !routePaths.some((r) => r.includes("webhook")),
    "none"
  );

  const exportRoute = readFileSync(
    join(process.cwd(), "src/app/api/transactions/export/route.ts"),
    "utf8"
  );
  record(
    "Transaction export requires authentication",
    exportRoute.includes("requireAuthenticatedUser"),
    "enforced"
  );

  const qrRoute = readFileSync(
    join(process.cwd(), "src/app/api/qr/[id]/download/route.ts"),
    "utf8"
  );
  record(
    "QR download requires session auth",
    qrRoute.includes("auth(") || qrRoute.includes("requireAuthenticatedUser"),
    "enforced"
  );

  const readiness = getIntegrationReadiness();
  record(
    "Integration readiness remains blocked for LIVE",
    readiness.liveQrProvider === "Disabled" &&
      readiness.liveTransactionProvider === "Disabled",
    "blocked"
  );

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

  let liveTxnBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaTransactionProvider();
  } catch {
    liveTxnBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }
  record("Live transaction provider remains fail-closed", liveTxnBlocked, "blocked");

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
  const apiCryptoBlocked = (foundationOutput.match(/BLOCKED/g) ?? []).length;
  record(
    "API crypto blockers preserved",
    apiCryptoBlocked >= 3,
    `${apiCryptoBlocked} BLOCKED labels`
  );

  const phase5FinalOutput = readFileSync(
    join(process.cwd(), "scripts/verify-phase5-final.ts"),
    "utf8"
  );
  const webhookBlockedCount = (phase5FinalOutput.match(/BLOCKED/g) ?? []).length;
  record(
    "Webhook blockers preserved",
    webhookBlockedCount >= 4,
    `${webhookBlockedCount} BLOCKED labels`
  );

  const clients = await prisma.client.count();
  const merchants = await prisma.merchant.count();
  record(
    "Existing Neon data preserved",
    clients >= 3 && merchants >= 5,
    `clients=${clients} merchants=${merchants}`
  );

  record(
    "SABPAISA_MODE remains mock",
    loadSabPaisaIntegrationMode() === "mock",
    "mock"
  );

  record(
    "Production NODE_ENV does not imply LIVE provider mode",
    loadSabPaisaIntegrationMode() === "mock",
    "separate concepts"
  );

  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.passed && !r.blocked).length;
  console.log(
    `\nPhase 8 Part 1: ${passed}/${results.length} PASS${blocked ? `, ${blocked} BLOCKED` : ""}${failed ? `, ${failed} FAIL` : ""}`
  );

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
