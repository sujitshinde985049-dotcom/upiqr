import { assertSabPaisaAuthConfigured, getSabPaisaHeaders } from "./auth";
import {
  assertSabPaisaConfigReady,
  loadSabPaisaConfig,
  type LoadSabPaisaConfigOptions,
} from "./config";
import { SABPAISA_REQUEST_TIMEOUT_MS } from "./constants";
import {
  assertEncryptedRequestEnvelope,
  createEncryptedRequestEnvelope,
  decryptSabPaisaPayload,
  encryptSabPaisaPayload,
  isEncryptedResponseEnvelope,
} from "./encryption";
import {
  parseSabPaisaErrorResponse,
  sabPaisaNetworkError,
  SabPaisaError,
} from "./errors";
import type {
  SabPaisaConfig,
  SabPaisaEncryptedRequestEnvelope,
  SabPaisaRequestOptions,
  SabPaisaResponseHeaders,
} from "./types";

export interface SabPaisaClientOptions extends LoadSabPaisaConfigOptions {
  config?: SabPaisaConfig;
  fetchImpl?: typeof fetch;
}

function resolveUrl(baseUrl: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
}

function readResponseEncryptionHeaders(headers: Headers): SabPaisaResponseHeaders {
  const encryptedHeader = headers.get("X-Response-Encrypted");
  const modeHeader = headers.get("X-Encryption-Mode");
  return {
    responseEncrypted:
      encryptedHeader?.toLowerCase() === "true" ? true : undefined,
    encryptionMode:
      modeHeader === "merchant" || modeHeader === "global"
        ? modeHeader
        : undefined,
  };
}

/**
 * Server-only SabPaisa HTTP client foundation.
 * Does not implement live QR creation in Phase 4 Part 1.
 */
export class SabPaisaClient {
  private readonly config: SabPaisaConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SabPaisaClientOptions = {}) {
    this.config = options.config ?? loadSabPaisaConfig(options);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getConfig(): SabPaisaConfig {
    return this.config;
  }

  buildEncryptedRequestBody(plaintextJson: string): SabPaisaEncryptedRequestEnvelope {
    assertSabPaisaConfigReady(this.config);
    const encryptedBase64 = encryptSabPaisaPayload(plaintextJson);
    const envelope = createEncryptedRequestEnvelope(encryptedBase64);
    assertEncryptedRequestEnvelope(envelope);
    return envelope;
  }

  async request<T = unknown>(options: SabPaisaRequestOptions): Promise<T> {
    assertSabPaisaConfigReady(this.config);
    assertSabPaisaAuthConfigured(this.config);

    const url = resolveUrl(this.config.baseUrl, options.path);
    const headers = getSabPaisaHeaders(this.config);
    const timeoutMs = options.timeoutMs ?? SABPAISA_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let body: string | undefined;
    if (options.body !== undefined) {
      if (options.encryptBody) {
        const plaintext = JSON.stringify(options.body);
        const envelope = this.buildEncryptedRequestBody(plaintext);
        body = JSON.stringify(envelope);
      } else {
        throw new SabPaisaError({
          code: "ENCRYPTION_REQUIRED",
          message: "Encryption required for this SabPaisa endpoint.",
          retryable: false,
        });
      }
    }

    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body,
        signal: controller.signal,
      });

      const responseText = await response.text();
      let parsedBody: unknown = null;
      if (responseText) {
        try {
          parsedBody = JSON.parse(responseText);
        } catch {
          parsedBody = responseText;
        }
      }

      if (!response.ok) {
        throw parseSabPaisaErrorResponse(response.status, parsedBody);
      }

      const responseHeaders = readResponseEncryptionHeaders(response.headers);
      const encryptedByHeader = responseHeaders.responseEncrypted === true;
      const encryptedByBody = isEncryptedResponseEnvelope(parsedBody);

      if (encryptedByHeader || encryptedByBody) {
        if (!isEncryptedResponseEnvelope(parsedBody)) {
          throw new SabPaisaError({
            status: response.status,
            code: "INVALID_ENCRYPTED_DATA",
            message: "Invalid encrypted data format.",
            retryable: false,
          });
        }

        const decrypted = decryptSabPaisaPayload(parsedBody.data);
        return JSON.parse(decrypted) as T;
      }

      return parsedBody as T;
    } catch (error) {
      if (error instanceof SabPaisaError) {
        throw error;
      }
      throw sabPaisaNetworkError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createSabPaisaClient(
  options: SabPaisaClientOptions = {}
): SabPaisaClient {
  return new SabPaisaClient(options);
}
