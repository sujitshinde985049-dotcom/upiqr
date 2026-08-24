const MAX_CORRELATION_ID_LENGTH = 64;

/**
 * Generate a bounded correlation ID using runtime Web Crypto (Edge + Node safe).
 * Format: 16 lowercase hex characters (8 random bytes), matching prior contract.
 */
export function generateCorrelationId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
