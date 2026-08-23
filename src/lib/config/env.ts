import { loadSabPaisaIntegrationMode } from "@/lib/sabpaisa/mode";
import type { SabPaisaIntegrationMode } from "@/lib/sabpaisa/mode";

export type AppRuntimeEnvironment = "development" | "test" | "production";

const INSECURE_AUTH_SECRET_MARKERS = [
  "dev-only-change-in-production",
  "your-secret-here",
  "changeme",
  "devpass",
] as const;

export type ServerConfig = {
  nodeEnv: AppRuntimeEnvironment;
  databaseUrl: string;
  authSecret: string;
  appUrl?: string;
  sabpaisaMode: SabPaisaIntegrationMode;
  allowMockPaymentEvents: boolean;
  allowMockTransactionFixtures: boolean;
};

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

function parseNodeEnv(): AppRuntimeEnvironment {
  const raw = process.env.NODE_ENV?.trim();
  if (raw === "production" || raw === "test" || raw === "development") {
    return raw;
  }
  return "development";
}

function parseOptionalUrl(name: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new ServerConfigError(`${name} must be a valid URL.`);
  }
}

/**
 * Load and validate trusted server environment configuration.
 * Never log or return secret values from this module to clients.
 */
export function loadServerConfig(): ServerConfig {
  const nodeEnv = parseNodeEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ServerConfigError("DATABASE_URL is required but not set.");
  }

  const authSecret = process.env.AUTH_SECRET?.trim();
  if (!authSecret) {
    throw new ServerConfigError("AUTH_SECRET is required but not set.");
  }
  if (authSecret.length < 32) {
    throw new ServerConfigError("AUTH_SECRET must be at least 32 characters.");
  }

  if (nodeEnv === "production") {
    const lowered = authSecret.toLowerCase();
    if (INSECURE_AUTH_SECRET_MARKERS.some((marker) => lowered.includes(marker))) {
      throw new ServerConfigError(
        "AUTH_SECRET must not use a development placeholder in production."
      );
    }
  }

  const appUrl =
    parseOptionalUrl("APP_URL", process.env.APP_URL?.trim()) ??
    parseOptionalUrl("AUTH_URL", process.env.AUTH_URL?.trim());

  let sabpaisaMode: SabPaisaIntegrationMode;
  try {
    sabpaisaMode = loadSabPaisaIntegrationMode();
  } catch {
    throw new ServerConfigError(
      "SABPAISA_MODE is invalid. Allowed values are mock or live."
    );
  }

  if (nodeEnv === "production" && sabpaisaMode !== "mock") {
    // Production runtime may be configured for live, but live activation remains
    // fail-closed until provider interoperability is complete.
    // No silent fallback to mock.
  }

  return {
    nodeEnv,
    databaseUrl,
    authSecret,
    appUrl,
    sabpaisaMode,
    allowMockPaymentEvents: process.env.ALLOW_MOCK_PAYMENT_EVENTS === "true",
    allowMockTransactionFixtures:
      process.env.ALLOW_MOCK_TRANSACTION_FIXTURES === "true",
  };
}

export function getSafeRuntimeSummary(config: ServerConfig) {
  return {
    nodeEnv: config.nodeEnv,
    sabpaisaMode: config.sabpaisaMode,
    hasAppUrl: Boolean(config.appUrl),
  };
}
