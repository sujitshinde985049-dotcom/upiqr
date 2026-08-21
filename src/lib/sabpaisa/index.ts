/**
 * Server-only SabPaisa integration foundation (Phase 4 Part 1).
 * Do not import from client components or expose credentials to the browser.
 */

export {
  assertSabPaisaAuthConfigured,
  getSabPaisaHeaders,
  getSabPaisaHeadersRecord,
} from "./auth";
export {
  SabPaisaClient,
  createSabPaisaClient,
  type SabPaisaClientOptions,
} from "./client";
export {
  SABPAISA_DEFAULT_ENV,
  SABPAISA_ENCRYPTED_PAYLOAD_LAYOUT,
  SABPAISA_ENCRYPTION_KEY_LENGTH_HEX,
  SABPAISA_ENV_VARS,
  SABPAISA_HMAC_SECRET_LENGTH_HEX,
  SABPAISA_KNOWN_ERROR_CODES,
  SABPAISA_REQUEST_TIMEOUT_MS,
} from "./constants";
export {
  assertSabPaisaConfigReady,
  getSabPaisaConfigSummary,
  loadSabPaisaConfig,
  validateSabPaisaEncryptionMasterKeyHex,
  validateSabPaisaHmacSecretHex,
  type LoadSabPaisaConfigOptions,
} from "./config";
export {
  assertEncryptedRequestEnvelope,
  createEncryptedRequestEnvelope,
  decryptSabPaisaPayload,
  encryptSabPaisaPayload,
  generateSabPaisaEncryptionRandomMaterial,
  isEncryptedResponseEnvelope,
  parseEncryptedPayloadBase64,
  verifySabPaisaPayloadIntegrity,
} from "./encryption";
export {
  SABPAISA_ENCRYPTION_INTEROP_MISSING_DETAILS,
  SabPaisaError,
  isSabPaisaError,
  parseSabPaisaErrorResponse,
  sabPaisaConfigError,
  sabPaisaEncryptionInteropBlockedError,
  sabPaisaNetworkError,
} from "./errors";
export type {
  ParsedEncryptedPayload,
  SabPaisaConfig,
  SabPaisaEncryptedRequestEnvelope,
  SabPaisaEncryptedResponseEnvelope,
  SabPaisaEncryptionMode,
  SabPaisaEnvironment,
  SabPaisaNormalizedErrorFields,
  SabPaisaPaymentRail,
  SabPaisaQrIdentifierInput,
  SabPaisaRequestOptions,
  SabPaisaResponseHeaders,
} from "./types";
export {
  buildLocalVpaPreview,
  normalizeSabPaisaPaymentRail,
  validateHdfcQrIdentifier,
  validateIciciQrIdentifier,
  validateSabPaisaQrIdentifier,
} from "./validation";
export {
  loadSabPaisaIntegrationMode,
  assertLiveSabPaisaIntegrationReady,
  type SabPaisaIntegrationMode,
} from "./mode";
export {
  sabPaisaCreateQrRequestSchema,
  sabPaisaCreateQrResponseSchema,
  sabPaisaQrDataSchema,
  sabPaisaRailIdSchema,
  MOCK_SABPAISA_ERROR_MAP,
  type SabPaisaCreateQrRequest,
  type SabPaisaCreateQrResponse,
  type SabPaisaQRProvider,
  type MockSabPaisaErrorSimulation,
} from "./qr-types";
export {
  getSabPaisaQRProvider,
  LiveSabPaisaQRProvider,
  MockSabPaisaQRProvider,
} from "./providers";
