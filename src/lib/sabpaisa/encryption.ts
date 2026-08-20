import { randomBytes } from "node:crypto";
import { SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT } from "./constants";
import {
  sabPaisaEncryptionInteropBlockedError,
  SabPaisaError,
} from "./errors";
import type {
  ParsedEncryptedPayload,
  SabPaisaEncryptedRequestEnvelope,
  SabPaisaEncryptedResponseEnvelope,
} from "./types";

export function generateSabPaisaEncryptionRandomMaterial(): {
  salt: Buffer;
  iv: Buffer;
} {
  return {
    salt: randomBytes(SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT.SALT_BYTES),
    iv: randomBytes(SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT.IV_BYTES),
  };
}

/** Parse documented binary layout: salt(32)+iv(16)+authTag(16)+ciphertext+hmac(48) */
export function parseEncryptedPayloadBase64(data: string): ParsedEncryptedPayload {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(data, "base64");
  } catch {
    throw new SabPaisaError({
      code: "INVALID_ENCRYPTED_DATA",
      message: "Invalid encrypted data format.",
      retryable: false,
    });
  }

  const { SALT_BYTES, IV_BYTES, AUTH_TAG_BYTES, HMAC_BYTES } =
    SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT;
  const minLength = SALT_BYTES + IV_BYTES + AUTH_TAG_BYTES + HMAC_BYTES;

  if (buffer.length < minLength) {
    throw new SabPaisaError({
      code: "INVALID_ENCRYPTED_DATA",
      message: "Invalid encrypted data format.",
      retryable: false,
    });
  }

  const saltEnd = SALT_BYTES;
  const ivEnd = saltEnd + IV_BYTES;
  const authTagEnd = ivEnd + AUTH_TAG_BYTES;
  const hmacStart = buffer.length - HMAC_BYTES;

  if (hmacStart < authTagEnd) {
    throw new SabPaisaError({
      code: "INVALID_ENCRYPTED_DATA",
      message: "Invalid encrypted data format.",
      retryable: false,
    });
  }

  return {
    salt: buffer.subarray(0, saltEnd),
    iv: buffer.subarray(saltEnd, ivEnd),
    authTag: buffer.subarray(ivEnd, authTagEnd),
    ciphertext: buffer.subarray(authTagEnd, hmacStart),
    hmac: buffer.subarray(hmacStart),
  };
}

export function createEncryptedRequestEnvelope(
  encryptedBase64: string
): SabPaisaEncryptedRequestEnvelope {
  if (!encryptedBase64.trim()) {
    throw new SabPaisaError({
      code: "INVALID_ENCRYPTED_DATA",
      message: "Invalid encrypted data format.",
      retryable: false,
    });
  }

  return {
    encrypted: true,
    data: encryptedBase64,
  };
}

export function assertEncryptedRequestEnvelope(
  body: unknown
): asserts body is SabPaisaEncryptedRequestEnvelope {
  if (
    !body ||
    typeof body !== "object" ||
    (body as SabPaisaEncryptedRequestEnvelope).encrypted !== true ||
    typeof (body as SabPaisaEncryptedRequestEnvelope).data !== "string" ||
    !(body as SabPaisaEncryptedRequestEnvelope).data.trim()
  ) {
    throw new SabPaisaError({
      code: "ENCRYPTION_REQUIRED",
      message: "Encryption required for this SabPaisa endpoint.",
      retryable: false,
    });
  }
}

export function isEncryptedResponseEnvelope(
  body: unknown
): body is SabPaisaEncryptedResponseEnvelope {
  return (
    !!body &&
    typeof body === "object" &&
    (body as SabPaisaEncryptedResponseEnvelope).encrypted === true &&
    typeof (body as SabPaisaEncryptedResponseEnvelope).data === "string" &&
    typeof (body as SabPaisaEncryptedResponseEnvelope).timestamp === "string"
  );
}

/**
 * Encrypt plaintext for SabPaisa v2.1 envelope.
 * BLOCKED until SabPaisa-provided PBKDF2/HMAC derivation details are available.
 */
export function encryptSabPaisaPayload(_plaintext: string): string {
  throw sabPaisaEncryptionInteropBlockedError();
}

/**
 * Decrypt SabPaisa v2.1 encrypted payload.
 * BLOCKED until SabPaisa-provided PBKDF2/HMAC derivation details are available.
 */
export function decryptSabPaisaPayload(_encryptedBase64: string): string {
  throw sabPaisaEncryptionInteropBlockedError();
}

export function verifySabPaisaPayloadIntegrity(_parsed: ParsedEncryptedPayload): void {
  throw sabPaisaEncryptionInteropBlockedError();
}
