import type { SabPaisaTransactionProvider } from "../transaction-types";
import { LiveSabPaisaTransactionProvider } from "./live-transaction-provider";
import { MockSabPaisaTransactionProvider } from "./mock-transaction-provider";
import { loadSabPaisaIntegrationMode, assertLiveSabPaisaIntegrationReady } from "../mode";
import type { SabPaisaQRProvider } from "../qr-types";
import { LiveSabPaisaQRProvider } from "./live-provider";
import {
  MockSabPaisaQRProvider,
  type MockSabPaisaQRProviderOptions,
} from "./mock-provider";

export function getSabPaisaQRProvider(
  options: MockSabPaisaQRProviderOptions = {}
): SabPaisaQRProvider {
  const mode = loadSabPaisaIntegrationMode();
  if (mode === "live") {
    assertLiveSabPaisaIntegrationReady();
    return new LiveSabPaisaQRProvider();
  }
  return new MockSabPaisaQRProvider(options);
}

export function getSabPaisaTransactionProvider(): SabPaisaTransactionProvider {
  const mode = loadSabPaisaIntegrationMode();
  if (mode === "live") {
    assertLiveSabPaisaIntegrationReady();
    return new LiveSabPaisaTransactionProvider();
  }
  return new MockSabPaisaTransactionProvider();
}

export { LiveSabPaisaQRProvider } from "./live-provider";
export { LiveSabPaisaTransactionProvider } from "./live-transaction-provider";
export {
  MockSabPaisaQRProvider,
  type MockSabPaisaQRProviderOptions,
} from "./mock-provider";
export { MockSabPaisaTransactionProvider } from "./mock-transaction-provider";
