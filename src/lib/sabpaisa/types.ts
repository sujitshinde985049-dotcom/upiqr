import { SABPAISA_ENV_VALUES } from "./constants";

export type SabPaisaEnvironment = (typeof SABPAISA_ENV_VALUES)[number];

export type SabPaisaPaymentRail = "hdfc" | "icici";

export interface SabPaisaConfig {
  env: SabPaisaEnvironment;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  encryptionMasterKeyHex: string;
  encryptionHmacSecretHex: string;
}

/** Documented encrypted request envelope — no plaintext fallback */
export interface SabPaisaEncryptedRequestEnvelope {
  encrypted: true;
  data: string;
}

/** Documented encrypted response envelope */
export interface SabPaisaEncryptedResponseEnvelope {
  encrypted: true;
  data: string;
  timestamp: string;
}

export type SabPaisaEncryptionMode = "merchant" | "global";

export interface SabPaisaResponseHeaders {
  responseEncrypted?: boolean;
  encryptionMode?: SabPaisaEncryptionMode;
}

export interface ParsedEncryptedPayload {
  salt: Buffer;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
  hmac: Buffer;
}

export interface SabPaisaRequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  encryptBody?: boolean;
  timeoutMs?: number;
}

/** Future Part 2 — QR creation fields only; not used in Part 1 */
export interface SabPaisaQrIdentifierInput {
  rail: SabPaisaPaymentRail;
  qrIdentifier: string;
}

export interface SabPaisaNormalizedErrorFields {
  status?: number;
  code: string;
  message: string;
  requestId?: string;
  retryable: boolean;
}
