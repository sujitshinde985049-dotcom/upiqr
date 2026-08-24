import { sanitizeForOperationalLog } from "./redaction";
import {
  categorizeOperationalError,
  getSafeErrorCode,
  type OperationalErrorCategory,
} from "./errors";

export type OperationalLogLevel = "info" | "warn" | "error" | "debug";

export type OperationalLogEvent = {
  level: OperationalLogLevel;
  event: string;
  timestamp: string;
  requestId?: string;
  category?: OperationalErrorCategory;
  entityType?: string;
  entityId?: string;
  providerMode?: string;
  errorCode?: string;
  message?: string;
  details?: Record<string, unknown>;
};

type LogInput = Omit<OperationalLogEvent, "level" | "timestamp"> & {
  level: OperationalLogLevel;
};

function emit(entry: LogInput): OperationalLogEvent {
  const payload: OperationalLogEvent = {
    ...entry,
    timestamp: new Date().toISOString(),
    details: entry.details
      ? (sanitizeForOperationalLog(entry.details) as Record<string, unknown>)
      : undefined,
  };

  const line = JSON.stringify(payload);

  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      if (process.env.NODE_ENV !== "production") {
        console.debug(line);
      }
      break;
    default:
      console.log(line);
  }

  return payload;
}

export const operationalLogger = {
  info(input: Omit<LogInput, "level">) {
    return emit({ ...input, level: "info" });
  },
  warn(input: Omit<LogInput, "level">) {
    return emit({ ...input, level: "warn" });
  },
  error(input: Omit<LogInput, "level">) {
    return emit({ ...input, level: "error" });
  },
  debug(input: Omit<LogInput, "level">) {
    return emit({ ...input, level: "debug" });
  },
  logOperationalFailure(
    event: string,
    error: unknown,
    context: Omit<LogInput, "level" | "event" | "category" | "errorCode"> = {}
  ) {
    const category = categorizeOperationalError(error);
    return emit({
      ...context,
      level: "error",
      event,
      category,
      errorCode: getSafeErrorCode(error),
      message: error instanceof Error ? error.message.slice(0, 200) : "failure",
      details: {
        ...(context.details ?? {}),
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
  },
  logAuthFailure(
    reason: "authentication_failed" | "authorization_denied",
    context: {
      requestId?: string;
      actorUserId?: string;
      entityType?: string;
      entityId?: string;
    } = {}
  ) {
    return emit({
      level: "warn",
      event: reason,
      category: "AUTHORIZATION_ERROR",
      requestId: context.requestId,
      entityType: context.entityType,
      entityId: context.entityId,
      details: sanitizeForOperationalLog({
        actorUserId: context.actorUserId,
      }) as Record<string, unknown>,
    });
  },
  logPaymentEventOutcome(input: {
    requestId?: string;
    provider: string;
    providerMode: string;
    providerEventId: string;
    providerTransactionId?: string;
    processingStatus: string;
    failureReasonCode?: string;
  }) {
    return emit({
      level: input.processingStatus === "REJECTED" ? "warn" : "info",
      event: "payment_event_processed",
      providerMode: input.providerMode,
      entityType: "PaymentEvent",
      entityId: input.providerEventId,
      requestId: input.requestId,
      details: {
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        processingStatus: input.processingStatus,
        failureReasonCode: input.failureReasonCode,
      },
    });
  },
};
