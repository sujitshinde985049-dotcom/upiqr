import type { SabPaisaConfig } from "./types";

const JSON_CONTENT_TYPE = "application/json";

/**
 * Build SabPaisa v2 authentication headers from trusted server configuration.
 * Credentials must never originate from browser or merchant form input.
 */
export function getSabPaisaHeaders(config: Pick<SabPaisaConfig, "apiKey" | "apiSecret">): Headers {
  const headers = new Headers();
  headers.set("X-API-Key", config.apiKey);
  headers.set("X-API-Secret", config.apiSecret);
  headers.set("Content-Type", JSON_CONTENT_TYPE);
  headers.set("Accept", JSON_CONTENT_TYPE);
  return headers;
}

export function getSabPaisaHeadersRecord(
  config: Pick<SabPaisaConfig, "apiKey" | "apiSecret">
): Record<string, string> {
  return {
    "X-API-Key": config.apiKey,
    "X-API-Secret": config.apiSecret,
    "Content-Type": JSON_CONTENT_TYPE,
    Accept: JSON_CONTENT_TYPE,
  };
}

/** Ensure auth headers are never empty when making outbound SabPaisa calls */
export function assertSabPaisaAuthConfigured(
  config: Pick<SabPaisaConfig, "apiKey" | "apiSecret">
): void {
  if (!config.apiKey.trim() || !config.apiSecret.trim()) {
    throw new Error("SabPaisa API credentials are not configured.");
  }
}
