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

export { LiveSabPaisaQRProvider } from "./live-provider";
export {
  MockSabPaisaQRProvider,
  type MockSabPaisaQRProviderOptions,
} from "./mock-provider";
