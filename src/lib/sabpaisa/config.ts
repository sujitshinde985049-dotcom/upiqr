import {
  SABPAISA_DEFAULT_ENV,
  SABPAISA_ENCRYPTION_KEY_LENGTH_HEX,
  SABPAISA_ENV_VARS,
  SABPAISA_HMAC_SECRET_LENGTH_HEX,
} from "./constants";
import { sabPaisaConfigError } from "./errors";
import type { SabPaisaConfig, SabPaisaEnvironment } from "./types";

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const HEX_96 = /^[0-9a-fA-F]{96}$/;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseSabPaisaEnvironment(raw: string | undefined): SabPaisaEnvironment {
  const value = (raw ?? SABPAISA_DEFAULT_ENV).toLowerCase();
  if (value === "staging" || value === "production") {
    return value;
  }
  throw sabPaisaConfigError("SabPaisa environment configuration is invalid.");
}

function validateBaseUrl(baseUrl: string, env: SabPaisaEnvironment): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw sabPaisaConfigError("SabPaisa base URL configuration is invalid.");
  }

  if (parsed.protocol !== "https:") {
    throw sabPaisaConfigError("SabPaisa base URL must use HTTPS.");
  }

  if (
    process.env.NODE_ENV !== "production" &&
    env === "production"
  ) {
    throw sabPaisaConfigError(
      "SabPaisa production environment cannot be used during local development."
    );
  }

  return parsed.origin.replace(/\/$/, "");
}

export function validateSabPaisaEncryptionMasterKeyHex(value: string | undefined): void {
  if (!value || !HEX_64.test(value)) {
    throw sabPaisaConfigError("SabPaisa encryption configuration is invalid.");
  }
}

export function validateSabPaisaHmacSecretHex(value: string | undefined): void {
  if (!value || !HEX_96.test(value)) {
    throw sabPaisaConfigError("SabPaisa encryption configuration is invalid.");
  }
}

export interface LoadSabPaisaConfigOptions {
  /** When false, encryption keys are not required (e.g. config-only validation tests) */
  requireEncryptionKeys?: boolean;
  /** When false, API credentials are not required */
  requireApiCredentials?: boolean;
}

/**
 * Load and validate SabPaisa configuration from trusted server environment variables.
 * Never accept credentials from browser or merchant forms.
 */
export function loadSabPaisaConfig(
  options: LoadSabPaisaConfigOptions = {}
): SabPaisaConfig {
  const {
    requireEncryptionKeys = true,
    requireApiCredentials = true,
  } = options;

  const env = parseSabPaisaEnvironment(readEnv(SABPAISA_ENV_VARS.ENV));
  const baseUrlRaw = readEnv(SABPAISA_ENV_VARS.BASE_URL);

  if (!baseUrlRaw) {
    throw sabPaisaConfigError("SabPaisa base URL is not configured.");
  }

  const baseUrl = validateBaseUrl(baseUrlRaw, env);

  const apiKey = readEnv(SABPAISA_ENV_VARS.API_KEY);
  const apiSecret = readEnv(SABPAISA_ENV_VARS.API_SECRET);
  const encryptionMasterKeyHex = readEnv(SABPAISA_ENV_VARS.ENCRYPTION_MASTER_KEY);
  const encryptionHmacSecretHex = readEnv(SABPAISA_ENV_VARS.ENCRYPTION_HMAC_SECRET);

  if (requireApiCredentials) {
    if (!apiKey || !apiSecret) {
      throw sabPaisaConfigError("SabPaisa API credentials are not configured.");
    }
  }

  if (requireEncryptionKeys) {
    validateSabPaisaEncryptionMasterKeyHex(encryptionMasterKeyHex);
    validateSabPaisaHmacSecretHex(encryptionHmacSecretHex);
  }

  return {
    env,
    baseUrl,
    apiKey: apiKey ?? "",
    apiSecret: apiSecret ?? "",
    encryptionMasterKeyHex: encryptionMasterKeyHex ?? "",
    encryptionHmacSecretHex: encryptionHmacSecretHex ?? "",
  };
}

export function assertSabPaisaConfigReady(config: SabPaisaConfig): void {
  if (!config.baseUrl) {
    throw sabPaisaConfigError("SabPaisa base URL is not configured.");
  }
  if (!config.apiKey || !config.apiSecret) {
    throw sabPaisaConfigError("SabPaisa API credentials are not configured.");
  }
  validateSabPaisaEncryptionMasterKeyHex(config.encryptionMasterKeyHex);
  validateSabPaisaHmacSecretHex(config.encryptionHmacSecretHex);
}

/** Safe summary for logs — never includes secrets */
export function getSabPaisaConfigSummary(config: SabPaisaConfig): {
  env: SabPaisaEnvironment;
  baseUrl: string;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  hasEncryptionKeys: boolean;
} {
  return {
    env: config.env,
    baseUrl: config.baseUrl,
    hasApiKey: Boolean(config.apiKey),
    hasApiSecret: Boolean(config.apiSecret),
    hasEncryptionKeys: Boolean(
      config.encryptionMasterKeyHex && config.encryptionHmacSecretHex
    ),
  };
}

export {
  SABPAISA_ENCRYPTION_KEY_LENGTH_HEX,
  SABPAISA_HMAC_SECRET_LENGTH_HEX,
};
