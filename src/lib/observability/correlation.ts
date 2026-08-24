import { randomBytes } from "node:crypto";

const MAX_CORRELATION_ID_LENGTH = 64;

export function generateCorrelationId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Accept only bounded, non-secret correlation identifiers from inbound requests.
 * Never use correlation IDs for authorization or payment identity.
 */
export function normalizeCorrelationId(
  value: string | null | undefined
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CORRELATION_ID_LENGTH) {
    return undefined;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function resolveRequestCorrelationId(
  headerValue: string | null | undefined
): string {
  return normalizeCorrelationId(headerValue) ?? generateCorrelationId();
}
