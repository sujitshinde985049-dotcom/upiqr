import { Prisma } from "@prisma/client";
import { ServerConfigError } from "@/lib/config/env";
import { PaymentEventProcessingError } from "@/lib/payment-events/errors";
import { SabPaisaError } from "@/lib/sabpaisa/errors";

export type OperationalErrorCategory =
  | "VALIDATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "DATABASE_ERROR"
  | "PROVIDER_ERROR"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

const PUBLIC_MESSAGES: Record<OperationalErrorCategory, string> = {
  VALIDATION_ERROR: "The request could not be processed.",
  AUTHORIZATION_ERROR: "You are not authorized to perform this action.",
  DATABASE_ERROR: "A temporary service issue occurred. Please try again.",
  PROVIDER_ERROR: "The payment provider request could not be completed.",
  CONFIGURATION_ERROR: "The application is not configured correctly.",
  INTERNAL_ERROR: "An unexpected error occurred.",
};

export function categorizeOperationalError(error: unknown): OperationalErrorCategory {
  if (error instanceof ServerConfigError) {
    return "CONFIGURATION_ERROR";
  }

  if (
    error instanceof PaymentEventProcessingError ||
    error instanceof SabPaisaError
  ) {
    return "PROVIDER_ERROR";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return "DATABASE_ERROR";
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "DATABASE_ERROR";
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("unauthorized") || message.includes("forbidden") || message.includes("denied")) {
    return "AUTHORIZATION_ERROR";
  }

  if (message.includes("invalid") || message.includes("validation")) {
    return "VALIDATION_ERROR";
  }

  if (message.includes("database") || message.includes("prisma")) {
    return "DATABASE_ERROR";
  }

  if (message.includes("provider") || message.includes("sabpaisa")) {
    return "PROVIDER_ERROR";
  }

  return "INTERNAL_ERROR";
}

export function getSafePrismaErrorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "P1001";
  }
  return undefined;
}

export function toPublicErrorMessage(category: OperationalErrorCategory): string {
  return PUBLIC_MESSAGES[category];
}

export function getSafeErrorCode(error: unknown): string | undefined {
  if (error instanceof PaymentEventProcessingError) {
    return error.code;
  }
  if (error instanceof SabPaisaError) {
    return error.code;
  }
  return getSafePrismaErrorCode(error);
}
