import {
  PAYMENT_EVENT_FAILURE_CODES,
  WEBHOOK_INTEROP_BLOCKED_REASON,
} from "../types";
import { PaymentEventProcessingError } from "../errors";

export class SabPaisaWebhookAdapter {
  parseAndNormalize(): never {
    throw new PaymentEventProcessingError(
      "SabPaisa payment webhook specification is not available",
      PAYMENT_EVENT_FAILURE_CODES.SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE
    );
  }

  verifySignature(): never {
    throw new PaymentEventProcessingError(
      WEBHOOK_INTEROP_BLOCKED_REASON,
      PAYMENT_EVENT_FAILURE_CODES.SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE
    );
  }

  verifyReplayProtection(): never {
    throw new PaymentEventProcessingError(
      WEBHOOK_INTEROP_BLOCKED_REASON,
      PAYMENT_EVENT_FAILURE_CODES.SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE
    );
  }
}

export function createSabPaisaWebhookAdapter(): SabPaisaWebhookAdapter {
  return new SabPaisaWebhookAdapter();
}
