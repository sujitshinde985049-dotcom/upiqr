/**
 * Phase 8 Part 3 operational observability verification.
 * Run: npm run test:phase8-part3
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  operationalLogger,
  sanitizeForOperationalLog,
  containsRedactedMarker,
  categorizeOperationalError,
  toPublicErrorMessage,
  generateCorrelationId,
  normalizeCorrelationId,
  resolveRequestCorrelationId,
} from "../src/lib/observability";
import { maskCustomerVpa } from "../src/lib/utils/mask-vpa";
import { Prisma } from "@prisma/client";
import { ServerConfigError } from "../src/lib/config/env";
import { loadSabPaisaIntegrationMode } from "../src/lib/sabpaisa/mode";

process.env.SABPAISA_MODE = "mock";

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

function serialized(input: unknown): string {
  return JSON.stringify(input);
}

async function runTests() {
  console.log("Running Phase 8 Part 3 observability tests...\n");

  record(
    "Structured logger module exists",
    existsSync(join(process.cwd(), "src/lib/observability/logger.ts")),
    "present"
  );
  record(
    "Redaction module exists",
    existsSync(join(process.cwd(), "src/lib/observability/redaction.ts")),
    "present"
  );
  record(
    "Server-only observability boundary",
    !existsSync(join(process.cwd(), "src/lib/observability/client.ts")),
    "no client export"
  );

  const infoLog = operationalLogger.info({
    event: "test_info",
    requestId: generateCorrelationId(),
    details: { sample: true },
  });
  record("Logger info level", infoLog.level === "info", infoLog.level);
  record("Logger timestamp field", Boolean(infoLog.timestamp), infoLog.timestamp);
  record("Logger event field", infoLog.event === "test_info", infoLog.event);

  const secretPayload = sanitizeForOperationalLog({
    password: "secret-pass",
    currentPassword: "old",
    newPassword: "new",
    passwordHash: "hash-value",
    temporaryPassword: "temp",
    authorization: "Bearer abc",
    cookie: "session=abc",
    token: "jwt-token",
    apiKey: "key",
    apiSecret: "secret",
    DATABASE_URL: "postgresql://user:pass@host/db",
    SABPAISA_ENCRYPTION_MASTER_KEY: "hexkey",
    SABPAISA_ENCRYPTION_HMAC_SECRET: "hmac",
    webhookSignature: "sig",
  });
  const secretSerialized = serialized(secretPayload);
  record("Password redaction", secretSerialized.includes("[REDACTED]"), "redacted");
  record("PasswordHash redaction", !secretSerialized.includes("hash-value"), "redacted");
  record("Auth header redaction", !secretSerialized.includes("Bearer abc"), "redacted");
  record("Cookie redaction", !secretSerialized.includes("session=abc"), "redacted");
  record("Token redaction", !secretSerialized.includes("jwt-token"), "redacted");
  record("DB URL redaction", !secretSerialized.includes("postgresql://"), "redacted");
  record("SabPaisa secret redaction", !secretSerialized.includes("hexkey"), "redacted");
  record("Encryption/HMAC redaction", !secretSerialized.includes("hmac"), "redacted");
  record("Webhook signature redaction", !secretSerialized.includes("sig"), "redacted");

  const privacyPayload = sanitizeForOperationalLog({
    customerVpa: "payer@okhdfcbank",
    currentAccountReference: "123456789012",
    rawProviderPayload: { nested: { authorization: "secret" } },
  });
  const privacySerialized = serialized(privacyPayload);
  record(
    "VPA masking in logs",
    privacySerialized.includes("pa****@okhdfcbank"),
    maskCustomerVpa("payer@okhdfcbank")
  );
  record(
    "Bank/account masking",
    privacySerialized.includes("12****12"),
    "masked"
  );
  record(
    "Nested provider payload redaction",
    privacySerialized.includes("[REDACTED]"),
    "redacted"
  );
  record(
    "Raw provider payload not blindly logged",
    containsRedactedMarker({ rawProviderPayload: { apiSecret: "x" } }),
    "sanitized"
  );

  record(
    "Validation error category",
    categorizeOperationalError(new Error("invalid input")) === "VALIDATION_ERROR",
    "VALIDATION_ERROR"
  );
  record(
    "Authorization error category",
    categorizeOperationalError(new Error("forbidden access")) === "AUTHORIZATION_ERROR",
    "AUTHORIZATION_ERROR"
  );
  record(
    "Database error category",
    categorizeOperationalError(
      new Prisma.PrismaClientKnownRequestError("db", {
        code: "P2028",
        clientVersion: "test",
      })
    ) === "DATABASE_ERROR",
    "DATABASE_ERROR"
  );
  record(
    "Configuration error category",
    categorizeOperationalError(new ServerConfigError("missing")) === "CONFIGURATION_ERROR",
    "CONFIGURATION_ERROR"
  );
  record(
    "Browser-safe public error message",
    toPublicErrorMessage("INTERNAL_ERROR").includes("unexpected"),
    "generic"
  );

  const healthSource = readFileSync(
    join(process.cwd(), "src/app/api/health/route.ts"),
    "utf8"
  );
  const readySource = readFileSync(
    join(process.cwd(), "src/app/api/ready/route.ts"),
    "utf8"
  );
  record("Health remains minimal", healthSource.includes('status: "ok"'), "minimal");
  record(
    "Health does not expose logs/migrations",
    !healthSource.includes("_prisma_migrations"),
    "clean"
  );
  record("Readiness remains read-only", readySource.includes("$queryRaw`SELECT 1`"), "SELECT 1");
  record(
    "Readiness failure response generic",
    readySource.includes("unavailable") && !readySource.includes("Prisma"),
    "generic"
  );
  record("Readiness does not migrate", !readySource.includes("migrate deploy"), "clean");
  record("Readiness does not call SabPaisa", !readySource.includes("getSabPaisa"), "clean");
  record(
    "Readiness failure operational log",
    readySource.includes("readiness_dependency_failed"),
    "logged safely"
  );

  const auditSource = readFileSync(join(process.cwd(), "src/lib/audit/audit-log.ts"), "utf8");
  const processorSource = readFileSync(
    join(process.cwd(), "src/lib/payment-events/processor.ts"),
    "utf8"
  );
  record(
    "Audit log uses operational logger",
    auditSource.includes("operationalLogger"),
    "structured"
  );
  record(
    "Audit log does not console.error raw failure",
    !auditSource.includes('console.error("Failed to write audit log"'),
    "removed"
  );
  record(
    "Payment processor safe outcome logging",
    processorSource.includes("logPaymentEventOutcome"),
    "present"
  );
  record(
    "Payment processor does not log raw event body",
    !processorSource.includes("JSON.stringify(event)"),
    "clean"
  );

  const authLog = operationalLogger.logAuthFailure("authentication_failed", {
    actorUserId: "USR001",
    entityType: "User",
    entityId: "USR001",
  });
  const authSerialized = serialized(authLog);
  record("Auth password not logged", !authSerialized.includes("password"), "clean");
  record(
    "Auth failure safe event",
    authLog.event === "authentication_failed",
    authLog.event
  );

  const correlation = generateCorrelationId();
  record(
    "Correlation ID generated server-side",
    /^[a-f0-9]{16}$/.test(correlation),
    correlation
  );
  record(
    "Correlation ID rejects secrets",
    normalizeCorrelationId("bad token!") === undefined,
    "rejected"
  );
  record(
    "Correlation ID resolves from header",
    Boolean(resolveRequestCorrelationId("req-12345")),
    "resolved"
  );

  const mockPaymentLog = operationalLogger.logPaymentEventOutcome({
    provider: "sabpaisa",
    providerMode: "mock",
    providerEventId: "mock_evt_test",
    providerTransactionId: "mock_txn_test",
    processingStatus: "PROCESSED",
  });
  record(
    "MOCK mode visible in payment logs",
    mockPaymentLog.providerMode === "mock",
    "mock"
  );
  record(
    "Payment log excludes credentials",
    !serialized(mockPaymentLog).includes("apiSecret"),
    "clean"
  );

  const opsDoc = readFileSync(join(process.cwd(), "docs/OPERATIONS_RUNBOOK.md"), "utf8");
  record("Operations runbook exists", opsDoc.length > 0, "present");
  record(
    "P1017/P2028 documented",
    opsDoc.includes("P1017") && opsDoc.includes("P2028"),
    "documented"
  );
  record(
    "Audit vs operational distinction documented",
    opsDoc.includes("AuditLog") && opsDoc.includes("operational logs"),
    "documented"
  );
  record(
    "Secret incident procedure exists",
    opsDoc.includes("Secret exposure incident"),
    "documented"
  );
  record(
    "External alerting NOT IMPLEMENTED",
    opsDoc.includes("NOT IMPLEMENTED"),
    "truthful"
  );
  record(
    "No automatic state-changing retry introduced",
    opsDoc.includes("Do **not** add automatic state-changing payment retries"),
    "documented"
  );
  record(
    "Observability does not mutate payment truth",
    !existsSync(join(process.cwd(), "src/lib/observability/payment-mutation.ts")),
    "no mutation helpers"
  );
  record(
    "SABPAISA_MODE remains mock",
    loadSabPaisaIntegrationMode() === "mock",
    "mock"
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\nPhase 8 Part 3: ${passed}/${results.length} PASS${failed ? `, ${failed} FAIL` : ""}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
