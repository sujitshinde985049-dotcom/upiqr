import { maskCustomerVpa } from "@/lib/utils/mask-vpa";

const SENSITIVE_KEY_PATTERN =
  /(password|passwordhash|currentpassword|newpassword|temporarypassword|authorization|cookie|token|secret|apikey|apisecret|database_url|encryption|hmac|signature|webhooksignature|masterkey|authsecret|sabpaisa_api|sabpaisa_encryption)/i;

const VPA_KEY_PATTERN = /(customervpa|^vpa$)/i;
const ACCOUNT_KEY_PATTERN = /(currentaccountreference|accountreference|bankaccount)/i;

const REDACTED = "[REDACTED]";

function maskAccountReference(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "****";
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
}

function redactPrimitive(key: string, value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
    if (VPA_KEY_PATTERN.test(key)) return maskCustomerVpa(value);
    if (ACCOUNT_KEY_PATTERN.test(key)) return maskAccountReference(value);
    if (value.includes("postgresql://") || value.includes("postgres://")) {
      return REDACTED;
    }
    if (value.includes("@") && VPA_KEY_PATTERN.test(key)) {
      return maskCustomerVpa(value);
    }
    return value;
  }

  if (typeof value === "object") {
    return sanitizeForOperationalLog(value);
  }

  return value;
}

export function sanitizeForOperationalLog<T>(input: T, depth = 0): T {
  if (depth > 6) return REDACTED as T;

  if (input == null || typeof input !== "object") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForOperationalLog(item, depth + 1)) as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = REDACTED;
      continue;
    }
    if (value && typeof value === "object") {
      output[key] = sanitizeForOperationalLog(value, depth + 1);
      continue;
    }
    output[key] = redactPrimitive(key, value);
  }

  return output as T;
}

export function containsRedactedMarker(value: unknown): boolean {
  const serialized = JSON.stringify(sanitizeForOperationalLog(value));
  return serialized.includes(REDACTED) || serialized.includes("****");
}
