"use server";

import { createAuditLog } from "@/lib/audit/audit-log";
import {
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import {
  getClientSettings,
  getPlatformSettings,
  resolveClientSettingsClientId,
  SettingsServiceError,
  updateClientSettings,
  updatePlatformSettings,
} from "@/lib/services/settings-service";
import {
  containsSecretLikeKeys,
  updateClientSettingsSchema,
  updatePlatformSettingsSchema,
} from "@/lib/validations/settings";
import { actionError, actionSuccess, type ActionResult } from "./types";

function mapSettingsError(error: unknown): ActionResult<never> {
  if (error instanceof SettingsServiceError) {
    if (error.code === "FORBIDDEN") {
      return actionError("You do not have permission to perform this action");
    }
    if (error.code === "NOT_FOUND") {
      return actionError("Requested settings were not found");
    }
    return actionError(error.message);
  }
  return actionError("Unable to save settings. Please try again.");
}

function buildChangedFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(next)) {
    if (previous[key] !== next[key]) {
      changed.push(key);
    }
  }
  return changed;
}

export async function updatePlatformSettingsAction(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof getPlatformSettings>>>> {
  try {
    const user = await requireAuthenticatedUser();

    const secretKey = containsSecretLikeKeys(input);
    if (secretKey) {
      return actionError("Unsupported setting field");
    }

    const parsed = updatePlatformSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const previous = await getPlatformSettings();
    const updated = await updatePlatformSettings(user, parsed.data);

    const changedFields = buildChangedFields(previous, updated);
    if (changedFields.length > 0) {
      await createAuditLog({
        userId: user.id,
        action: "PLATFORM_SETTINGS_UPDATED",
        entityType: "PlatformSettings",
        entityId: "platform",
        metadata: {
          changedFields,
        },
      });
    }

    return actionSuccess(updated);
  } catch (error) {
    return mapSettingsError(error);
  }
}

export async function updateClientSettingsAction(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof getClientSettings>>>> {
  try {
    const user = await requireAuthenticatedUser();

    const secretKey = containsSecretLikeKeys(input);
    if (secretKey) {
      return actionError("Unsupported setting field");
    }

    const parsed = updateClientSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const resolved = resolveClientSettingsClientId(user, parsed.data.clientId);
    if ("error" in resolved) {
      return actionError(resolved.error);
    }

    const { clientId } = resolved;
    const previous = await getClientSettings(user, clientId);
    const { clientId: _ignored, ...settingsInput } = parsed.data;
    const updated = await updateClientSettings(user, clientId, settingsInput);

    const changedFields = buildChangedFields(previous, updated);
    if (changedFields.length > 0) {
      await createAuditLog({
        userId: user.id,
        clientId,
        action: "CLIENT_SETTINGS_UPDATED",
        entityType: "ClientSettings",
        entityId: clientId,
        metadata: {
          changedFields,
        },
      });
    }

    return actionSuccess(updated);
  } catch (error) {
    return mapSettingsError(error);
  }
}
