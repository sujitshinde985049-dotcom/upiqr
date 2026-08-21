/** SabPaisa environment variable names — placeholders only in .env.example */

export const SABPAISA_ENV_VARS = {
  ENV: "SABPAISA_ENV",
  BASE_URL: "SABPAISA_BASE_URL",
  API_KEY: "SABPAISA_API_KEY",
  API_SECRET: "SABPAISA_API_SECRET",
  ENCRYPTION_MASTER_KEY: "SABPAISA_ENCRYPTION_MASTER_KEY",
  ENCRYPTION_HMAC_SECRET: "SABPAISA_ENCRYPTION_HMAC_SECRET",
  MODE: "SABPAISA_MODE",
} as const;

export const SABPAISA_MODE_VALUES = ["mock", "live"] as const;
export const SABPAISA_DEFAULT_MODE = "mock" as const;

export const SABPAISA_ENV_VALUES = ["staging", "production"] as const;

/** Default for local development — never production */
export const SABPAISA_DEFAULT_ENV = "staging" as const;

export const SABPAISA_REQUEST_TIMEOUT_MS = 30_000;

/** Documented v2.1 encrypted binary payload layout (bytes) */
export const SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT = {
  SALT_BYTES: 32,
  IV_BYTES: 16,
  AUTH_TAG_BYTES: 16,
  HMAC_BYTES: 48,
  PBKDF2_ITERATIONS: 100_000,
} as const;

export const SABPAISA_ENCRYPTION_KEY_LENGTH_HEX = 64;
export const SABPAISA_HMAC_SECRET_LENGTH_HEX = 96;

export const SABPAISA_KNOWN_ERROR_CODES = [
  "AUTH_REQUIRED",
  "INVALID_CREDENTIALS",
  "KEY_REVOKED",
  "KEY_INACTIVE",
  "INSUFFICIENT_PERMISSIONS",
  "RATE_LIMIT_EXCEEDED",
  "AUTH_ERROR",
  "ENCRYPTION_REQUIRED",
  "INVALID_ENCRYPTED_DATA",
  "QR_003",
  "QR_NOT_FOUND",
  "INVALID_FORMAT",
  "FORMAT_NOT_SUPPORTED",
  "QR_PAYLOAD_MISSING",
  "LIVE_INTEGRATION_NOT_READY",
  "QR_VALIDATION_ERROR",
] as const;
