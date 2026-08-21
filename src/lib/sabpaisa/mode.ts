import {
  SABPAISA_DEFAULT_MODE,
  SABPAISA_ENV_VARS,
  SABPAISA_MODE_VALUES,
} from "./constants";
import { loadSabPaisaConfig } from "./config";
import {
  sabPaisaConfigError,
  SabPaisaError,
  SABPAISA_ENCRYPTION_INTEROP_MISSING_DETAILS,
} from "./errors";

export type SabPaisaIntegrationMode = (typeof SABPAISA_MODE_VALUES)[number];

export function loadSabPaisaIntegrationMode(): SabPaisaIntegrationMode {
  const raw = process.env[SABPAISA_ENV_VARS.MODE]?.trim().toLowerCase();
  const mode = raw || SABPAISA_DEFAULT_MODE;
  if (mode === "mock" || mode === "live") {
    return mode;
  }
  throw sabPaisaConfigError("SabPaisa integration mode is invalid.");
}

/**
 * Live mode must fail safely — never silently fall back to mock.
 */
export function assertLiveSabPaisaIntegrationReady(): void {
  try {
    loadSabPaisaConfig();
  } catch {
    throw new SabPaisaError({
      code: "LIVE_INTEGRATION_NOT_READY",
      message:
        "Live SabPaisa integration is not ready. Configure credentials and encryption interoperability.",
      retryable: false,
    });
  }

  throw new SabPaisaError({
    code: "LIVE_INTEGRATION_NOT_READY",
    message: `Live SabPaisa integration is not ready. Missing: ${SABPAISA_ENCRYPTION_INTEROP_MISSING_DETAILS[0]}`,
    retryable: false,
  });
}
