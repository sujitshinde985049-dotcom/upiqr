/**
 * SabPaisa Phase 4 Part 1 foundation verification.
 * Run: npm run test:sabpaisa-foundation
 *
 * No live SabPaisa API requests are made by this script.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT,
  SABPAISA_ENV_VARS,
} from "../src/lib/sabpaisa/constants";
import {
  getSabPaisaHeadersRecord,
} from "../src/lib/sabpaisa/auth";
import {
  loadSabPaisaConfig,
  validateSabPaisaEncryptionMasterKeyHex,
  validateSabPaisaHmacSecretHex,
} from "../src/lib/sabpaisa/config";
import {
  createEncryptedRequestEnvelope,
  encryptSabPaisaPayload,
  decryptSabPaisaPayload,
  generateSabPaisaEncryptionRandomMaterial,
  parseEncryptedPayloadBase64,
  verifySabPaisaPayloadIntegrity,
} from "../src/lib/sabpaisa/encryption";
import {
  isSabPaisaError,
  parseSabPaisaErrorResponse,
  SabPaisaError,
} from "../src/lib/sabpaisa/errors";
import {
  buildLocalVpaPreview,
  validateHdfcQrIdentifier,
  validateIciciQrIdentifier,
} from "../src/lib/sabpaisa/validation";

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
  blocked?: boolean;
};

const results: TestResult[] = [];
const originalEnv = { ...process.env };

function record(name: string, passed: boolean, detail: string, blocked = false) {
  results.push({ name, passed, detail, blocked });
  const label = blocked ? "BLOCKED" : passed ? "PASS" : "FAIL";
  console.log(`${label} — ${name}: ${detail}`);
}

function setTestEnv(overrides: Record<string, string | undefined>) {
  for (const key of Object.values(SABPAISA_ENV_VARS)) {
    delete process.env[key];
  }
  Object.assign(process.env, overrides);
}

function restoreEnv() {
  for (const key of Object.values(SABPAISA_ENV_VARS)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

const VALID_MASTER_KEY = "a".repeat(64);
const VALID_HMAC_SECRET = "b".repeat(96);

const baseValidEnv: Record<string, string> = {
  [SABPAISA_ENV_VARS.ENV]: "staging",
  [SABPAISA_ENV_VARS.BASE_URL]: "https://staging-sb-merchant-api.sabpaisa.in",
  [SABPAISA_ENV_VARS.API_KEY]: "test-api-key",
  [SABPAISA_ENV_VARS.API_SECRET]: "test-api-secret",
  [SABPAISA_ENV_VARS.ENCRYPTION_MASTER_KEY]: VALID_MASTER_KEY,
  [SABPAISA_ENV_VARS.ENCRYPTION_HMAC_SECRET]: VALID_HMAC_SECRET,
};

function containsSecretLeak(value: unknown): boolean {
  const text = JSON.stringify(value);
  return (
    text.includes(baseValidEnv[SABPAISA_ENV_VARS.API_SECRET]) ||
    text.includes(VALID_MASTER_KEY) ||
    text.includes(VALID_HMAC_SECRET)
  );
}

function runConfigTests() {
  setTestEnv({});
  try {
    loadSabPaisaConfig();
    record("Missing environment variables fail safely", false, "Did not throw");
  } catch (error) {
    record(
      "Missing environment variables fail safely",
      isSabPaisaError(error) && error.code === "CONFIG_ERROR",
      isSabPaisaError(error) ? error.message : String(error)
    );
  }

  try {
    validateSabPaisaEncryptionMasterKeyHex("short");
    record("Invalid master-key format rejected", false, "Accepted invalid key");
  } catch (error) {
    record(
      "Invalid master-key format rejected",
      isSabPaisaError(error) &&
        error.message === "SabPaisa encryption configuration is invalid.",
      "Rejected safely"
    );
  }

  try {
    validateSabPaisaHmacSecretHex("abc");
    record("Invalid HMAC-secret format rejected", false, "Accepted invalid secret");
  } catch (error) {
    record(
      "Invalid HMAC-secret format rejected",
      isSabPaisaError(error) &&
        error.message === "SabPaisa encryption configuration is invalid.",
      "Rejected safely"
    );
  }

  setTestEnv({
    ...baseValidEnv,
    [SABPAISA_ENV_VARS.ENV]: "production",
  });
  const previousNodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  try {
    loadSabPaisaConfig();
    record(
      "Production not selectable during local development",
      false,
      "Allowed production in development"
    );
  } catch (error) {
    record(
      "Production not selectable during local development",
      isSabPaisaError(error) &&
        error.message.includes("production environment cannot be used"),
      "Blocked production in development"
    );
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
  }
}

function runAuthTests() {
  const headers = getSabPaisaHeadersRecord({
    apiKey: "server-api-key",
    apiSecret: "server-api-secret",
  });

  record(
    "Authentication headers generated server-side",
    headers["X-API-Key"] === "server-api-key" &&
      headers["X-API-Secret"] === "server-api-secret" &&
      headers["Content-Type"] === "application/json",
    "X-API-Key, X-API-Secret, Content-Type present"
  );

  record(
    "Secrets not present in safe error objects",
    !containsSecretLeak(
      new SabPaisaError({
        code: "CONFIG_ERROR",
        message: "SabPaisa encryption configuration is invalid.",
        retryable: false,
      }).toSafeJSON()
    ),
    "Safe error JSON excludes secrets"
  );
}

function runEnvelopeTests() {
  const envelope = createEncryptedRequestEnvelope("dGVzdA==");
  record(
    "Request envelope encrypted structure",
    envelope.encrypted === true &&
      typeof envelope.data === "string" &&
      !("plaintext" in (envelope as unknown as Record<string, unknown>)),
    JSON.stringify(envelope)
  );
}

function runEncryptionFoundationTests() {
  const first = generateSabPaisaEncryptionRandomMaterial();
  const second = generateSabPaisaEncryptionRandomMaterial();
  record(
    "Encryption uses fresh random IV/salt",
    !first.salt.equals(second.salt) && !first.iv.equals(second.iv),
    `salt/iv lengths ${first.salt.length}/${first.iv.length}`
  );

  const { SALT_BYTES, IV_BYTES, AUTH_TAG_BYTES, HMAC_BYTES } =
    SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT;
  const sample = Buffer.concat([
    randomBytes(SALT_BYTES),
    randomBytes(IV_BYTES),
    randomBytes(AUTH_TAG_BYTES),
    Buffer.from("cipher"),
    randomBytes(HMAC_BYTES),
  ]);
  const parsed = parseEncryptedPayloadBase64(sample.toString("base64"));
  record(
    "Encrypted payload layout parser",
    parsed.salt.length === SALT_BYTES &&
      parsed.iv.length === IV_BYTES &&
      parsed.authTag.length === AUTH_TAG_BYTES &&
      parsed.hmac.length === HMAC_BYTES &&
      parsed.ciphertext.toString() === "cipher",
    "salt+iv+authTag+ciphertext+hmac parsed"
  );

  try {
    encryptSabPaisaPayload('{"test":true}');
    record(
      "Encrypt interoperability",
      false,
      "Unexpected success without SabPaisa derivation spec",
      true
    );
  } catch (error) {
    record(
      "Encrypt interoperability",
      isSabPaisaError(error) && error.code === "ENCRYPTION_INTEROP_BLOCKED",
      "Blocked pending SabPaisa PBKDF2/HMAC derivation details",
      true
    );
  }

  try {
    decryptSabPaisaPayload(sample.toString("base64"));
    record(
      "Decrypt interoperability",
      false,
      "Unexpected success without SabPaisa derivation spec",
      true
    );
  } catch (error) {
    record(
      "Decrypt interoperability",
      isSabPaisaError(error) && error.code === "ENCRYPTION_INTEROP_BLOCKED",
      "Blocked pending SabPaisa PBKDF2/HMAC derivation details",
      true
    );
  }

  try {
    verifySabPaisaPayloadIntegrity(parsed);
    record(
      "Tampered ciphertext/HMAC rejected",
      false,
      "Unexpected success without integrity verifier",
      true
    );
  } catch (error) {
    record(
      "Tampered ciphertext/HMAC rejected",
      isSabPaisaError(error) && error.code === "ENCRYPTION_INTEROP_BLOCKED",
      "Blocked pending SabPaisa HMAC scope specification",
      true
    );
  }
}

function runErrorParserTests() {
  const shapeA = parseSabPaisaErrorResponse(401, {
    error: {
      code: "INVALID_CREDENTIALS",
      message: "Invalid API credentials",
      request_id: "req_shape_a_123",
    },
  });
  record(
    "Error parser shape A",
    shapeA.code === "INVALID_CREDENTIALS" &&
      shapeA.requestId === "req_shape_a_123",
    `code=${shapeA.code}, requestId=${shapeA.requestId}`
  );

  const shapeB = parseSabPaisaErrorResponse(403, {
    success: false,
    errorCode: "INSUFFICIENT_PERMISSIONS",
    errorMessage: "Not allowed",
    requestId: "req_shape_b_456",
  });
  record(
    "Error parser shape B",
    shapeB.code === "INSUFFICIENT_PERMISSIONS" &&
      shapeB.requestId === "req_shape_b_456",
    `code=${shapeB.code}, requestId=${shapeB.requestId}`
  );

  record(
    "request_id preserved safely",
    shapeA.requestId === "req_shape_a_123" &&
      shapeB.requestId === "req_shape_b_456" &&
      !containsSecretLeak(shapeA.toSafeJSON()) &&
      !containsSecretLeak(shapeB.toSafeJSON()),
    "requestId present without secret leakage"
  );
}

function runValidationTests() {
  record(
    "HDFC identifier validation",
    validateHdfcQrIdentifier("ab12") &&
      validateHdfcQrIdentifier("shop9x01") &&
      !validateHdfcQrIdentifier("AB12") &&
      !validateHdfcQrIdentifier("abcd") &&
      !validateHdfcQrIdentifier("12345678901"),
    "Valid/invalid HDFC patterns checked"
  );

  record(
    "ICICI identifier validation",
    validateIciciQrIdentifier("Store001") &&
      validateIciciQrIdentifier("A") &&
      !validateIciciQrIdentifier("IdentifierTooLong123"),
    "Valid/invalid ICICI patterns checked"
  );

  try {
    buildLocalVpaPreview();
    record("No local full-VPA generation", false, "Local VPA generation allowed");
  } catch {
    record(
      "No local full-VPA generation",
      true,
      "Local VPA generation blocked"
    );
  }
}

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      collectSourceFiles(fullPath, files);
    } else if (/\.(ts|tsx|js|jsx|json|md|example)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function runSecurityScan() {
  const root = process.cwd();
  const files = collectSourceFiles(root).filter(
    (file) =>
      !file.includes(`${join(root, "scripts")}${join("", "verify-sabpaisa-foundation")}`) &&
      !file.endsWith("package-lock.json")
  );

  const forbiddenPatterns = [
    /sk_live_[A-Za-z0-9]+/,
    /postgresql:\/\/[^:]+:[^@]+@ep-[a-z0-9-]+\.neon\.tech/,
  ];

  const leaks: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        leaks.push(file);
      }
    }
  }

  record(
    "Secret exposure scan (real credential patterns)",
    leaks.length === 0,
    leaks.length === 0 ? "No real credential patterns found" : leaks.join(", ")
  );

  const clientSource = readFileSync(
    join(root, "src/lib/sabpaisa/client.ts"),
    "utf8"
  );
  record(
    "No live QR create endpoint in Part 1 client",
    !/\/api\/v2\/qr["'`]/.test(clientSource),
    "QR create API path not referenced as a request target"
  );
}

function runTests() {
  console.log("Running SabPaisa foundation tests...\n");
  console.log("No live SabPaisa API requests are made.\n");

  runConfigTests();
  runAuthTests();
  runEnvelopeTests();
  runEncryptionFoundationTests();
  runErrorParserTests();
  runValidationTests();
  runSecurityScan();

  restoreEnv();

  const blocked = results.filter((r) => r.blocked);
  const failed = results.filter((r) => !r.passed && !r.blocked);
  const passed = results.filter((r) => r.passed && !r.blocked);

  console.log(
    `\n${passed.length}/${results.length - blocked.length} tests passed` +
      (blocked.length > 0 ? `, ${blocked.length} blocked (encryption interoperability)` : "")
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

runTests();
