import { SABPAISA_KNOWN_ERROR_CODES } from "./constants";
import type { SabPaisaNormalizedErrorFields } from "./types";

const RETRYABLE_CODES = new Set<string>([
  "RATE_LIMIT_EXCEEDED",
  "NETWORK_ERROR",
  "TIMEOUT",
]);

/**
 * Missing interoperable encryption details from SabQR v2.1 documentation.
 * Do not guess PBKDF2/HMAC derivation — obtain SabPaisa Node.js helper from account manager.
 */
export const SABPAISA_ENCRYPTION_INTEROP_MISSING_DETAILS = [
  "PBKDF2 password/input material (master key encoding and any additional inputs)",
  "PBKDF2 salt source relative to the 32-byte payload salt field",
  "PBKDF2 digest algorithm and derived key length/split for AES-256-GCM",
  "HMAC-SHA384 key material (direct HMAC secret vs derived key)",
  "Exact HMAC message scope (which bytes of salt+iv+authTag+ciphertext are authenticated)",
] as const;

export class SabPaisaError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly safeForClient: boolean;

  constructor(fields: SabPaisaNormalizedErrorFields & { safeForClient?: boolean }) {
    super(fields.message);
    this.name = "SabPaisaError";
    this.status = fields.status;
    this.code = fields.code;
    this.requestId = fields.requestId;
    this.retryable = fields.retryable;
    this.safeForClient = fields.safeForClient ?? true;
  }

  toSafeJSON(): SabPaisaNormalizedErrorFields {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      retryable: this.retryable,
    };
  }
}

export function isSabPaisaError(error: unknown): error is SabPaisaError {
  return error instanceof SabPaisaError;
}

function isKnownCode(code: string): boolean {
  return (SABPAISA_KNOWN_ERROR_CODES as readonly string[]).includes(code);
}

function normalizeCode(raw: string | undefined, fallback: string): string {
  const code = (raw ?? fallback).trim().toUpperCase().replace(/\s+/g, "_");
  return isKnownCode(code) ? code : code || fallback;
}

/** Defensive parser for documented SabPaisa error envelope variants */
export function parseSabPaisaErrorResponse(
  status: number,
  body: unknown
): SabPaisaError {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;

    // Shape A: { error: { code, message, request_id? } }
    if (record.error && typeof record.error === "object") {
      const err = record.error as Record<string, unknown>;
      const code = normalizeCode(
        typeof err.code === "string" ? err.code : undefined,
        status === 401 ? "AUTH_REQUIRED" : "AUTH_ERROR"
      );
      const message =
        typeof err.message === "string" && err.message.trim()
          ? err.message
          : "SabPaisa request failed.";
      const requestId =
        typeof err.request_id === "string"
          ? err.request_id
          : typeof err.requestId === "string"
            ? err.requestId
            : undefined;
      return new SabPaisaError({
        status,
        code,
        message,
        requestId,
        retryable: RETRYABLE_CODES.has(code),
      });
    }

    // Shape B: { success: false, errorCode, errorMessage, requestId }
    if (record.success === false) {
      const code = normalizeCode(
        typeof record.errorCode === "string" ? record.errorCode : undefined,
        "AUTH_ERROR"
      );
      const message =
        typeof record.errorMessage === "string" && record.errorMessage.trim()
          ? record.errorMessage
          : "SabPaisa request failed.";
      const requestId =
        typeof record.requestId === "string"
          ? record.requestId
          : typeof record.request_id === "string"
            ? record.request_id
            : undefined;
      return new SabPaisaError({
        status,
        code,
        message,
        requestId,
        retryable: RETRYABLE_CODES.has(code),
      });
    }

    // Encryption-related top-level messages
    if (typeof record.message === "string") {
      const lower = record.message.toLowerCase();
      if (lower.includes("encryption required")) {
        return new SabPaisaError({
          status,
          code: "ENCRYPTION_REQUIRED",
          message: "Encryption required for this SabPaisa endpoint.",
          retryable: false,
        });
      }
      if (lower.includes("invalid encrypted data")) {
        return new SabPaisaError({
          status,
          code: "INVALID_ENCRYPTED_DATA",
          message: "Invalid encrypted data format.",
          retryable: false,
        });
      }
    }
  }

  return new SabPaisaError({
    status,
    code: status === 401 ? "AUTH_REQUIRED" : "AUTH_ERROR",
    message: "SabPaisa request failed.",
    retryable: status >= 500 || status === 429,
  });
}

export function sabPaisaNetworkError(cause?: unknown): SabPaisaError {
  const message =
    cause instanceof Error && cause.name === "AbortError"
      ? "SabPaisa request timed out."
      : "Unable to reach SabPaisa.";
  return new SabPaisaError({
    code: cause instanceof Error && cause.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
    message,
    retryable: true,
    safeForClient: true,
  });
}

export function sabPaisaConfigError(message: string): SabPaisaError {
  return new SabPaisaError({
    code: "CONFIG_ERROR",
    message,
    retryable: false,
  });
}

export function sabPaisaEncryptionInteropBlockedError(): SabPaisaError {
  return new SabPaisaError({
    code: "ENCRYPTION_INTEROP_BLOCKED",
    message:
      "SabPaisa encryption/decryption interoperability is blocked until SabPaisa-provided derivation details are available.",
    retryable: false,
    safeForClient: false,
  });
}
