import { prisma } from "@/lib/db/prisma";
import {
  AuthError,
  requireClientAccess,
} from "@/lib/auth/authorization";
import { isSuperAdmin, type SessionUser } from "@/lib/auth/types";
import type {
  UpdateClientSettingsInput,
  UpdatePlatformSettingsInput,
} from "@/lib/validations/settings";

export const PLATFORM_SETTINGS_ID = "platform";

export const DEFAULT_PLATFORM_SETTINGS = {
  platformName: "MahaCred QR",
  supportEmail: "support@mahacred.in",
  supportPhone: null as string | null,
};

export const DEFAULT_CLIENT_SETTINGS = {
  emailNotifications: true,
  transactionAlerts: true,
  weeklyReports: false,
};

export type PlatformSettingsView = {
  platformName: string;
  supportEmail: string;
  supportPhone: string | null;
  updatedAt: Date | null;
};

export type ClientSettingsView = {
  clientId: string;
  emailNotifications: boolean;
  transactionAlerts: boolean;
  weeklyReports: boolean;
  updatedAt: Date | null;
};

export class SettingsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION"
  ) {
    super(message);
    this.name = "SettingsServiceError";
  }
}

function canReadClientSettings(user: SessionUser, clientId: string): boolean {
  if (isSuperAdmin(user)) return true;
  return user.role === "CLIENT_ADMIN" && user.clientId === clientId;
}

function canManageClientSettings(user: SessionUser, clientId: string): boolean {
  if (isSuperAdmin(user)) return true;
  return user.role === "CLIENT_ADMIN" && user.clientId === clientId;
}

export function canManagePlatformSettings(user: SessionUser): boolean {
  return isSuperAdmin(user);
}

export function resolveClientSettingsClientId(
  user: SessionUser,
  submittedClientId?: string | null
): { clientId: string } | { error: string } {
  if (isSuperAdmin(user)) {
    const clientId = submittedClientId?.trim();
    if (!clientId) {
      return { error: "Select Bank / Patsanstha" };
    }
    return { clientId };
  }

  if (user.role !== "CLIENT_ADMIN" || !user.clientId) {
    return { error: "Insufficient permissions to manage client settings" };
  }

  return { clientId: user.clientId };
}

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  const row = await prisma.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_ID },
  });

  if (!row) {
    return {
      ...DEFAULT_PLATFORM_SETTINGS,
      updatedAt: null,
    };
  }

  return {
    platformName: row.platformName,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    updatedAt: row.updatedAt,
  };
}

export async function getClientSettings(
  user: SessionUser,
  clientId: string
): Promise<ClientSettingsView> {
  if (!canReadClientSettings(user, clientId)) {
    throw new SettingsServiceError(
      "Access to client settings is not permitted",
      "FORBIDDEN"
    );
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });
  if (!client) {
    throw new SettingsServiceError("Client not found", "NOT_FOUND");
  }

  const row = await prisma.clientSettings.findUnique({
    where: { clientId },
  });

  if (!row) {
    return {
      clientId,
      ...DEFAULT_CLIENT_SETTINGS,
      updatedAt: null,
    };
  }

  return {
    clientId: row.clientId,
    emailNotifications: row.emailNotifications,
    transactionAlerts: row.transactionAlerts,
    weeklyReports: row.weeklyReports,
    updatedAt: row.updatedAt,
  };
}

export async function updatePlatformSettings(
  user: SessionUser,
  input: UpdatePlatformSettingsInput
): Promise<PlatformSettingsView> {
  if (!canManagePlatformSettings(user)) {
    throw new SettingsServiceError(
      "Only Super Admin can update platform settings",
      "FORBIDDEN"
    );
  }

  const row = await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: {
      id: PLATFORM_SETTINGS_ID,
      platformName: input.platformName,
      supportEmail: input.supportEmail,
      supportPhone: input.supportPhone ?? null,
    },
    update: {
      platformName: input.platformName,
      supportEmail: input.supportEmail,
      supportPhone: input.supportPhone ?? null,
    },
  });

  return {
    platformName: row.platformName,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    updatedAt: row.updatedAt,
  };
}

export async function updateClientSettings(
  user: SessionUser,
  clientId: string,
  input: Omit<UpdateClientSettingsInput, "clientId">
): Promise<ClientSettingsView> {
  if (!canManageClientSettings(user, clientId)) {
    throw new SettingsServiceError(
      "Access to client settings is not permitted",
      "FORBIDDEN"
    );
  }

  try {
    requireClientAccess(user, clientId);
  } catch (error) {
    if (error instanceof AuthError) {
      throw new SettingsServiceError(error.message, "FORBIDDEN");
    }
    throw error;
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });
  if (!client) {
    throw new SettingsServiceError("Client not found", "NOT_FOUND");
  }

  const row = await prisma.clientSettings.upsert({
    where: { clientId },
    create: {
      clientId,
      emailNotifications: input.emailNotifications,
      transactionAlerts: input.transactionAlerts,
      weeklyReports: input.weeklyReports,
    },
    update: {
      emailNotifications: input.emailNotifications,
      transactionAlerts: input.transactionAlerts,
      weeklyReports: input.weeklyReports,
    },
  });

  return {
    clientId: row.clientId,
    emailNotifications: row.emailNotifications,
    transactionAlerts: row.transactionAlerts,
    weeklyReports: row.weeklyReports,
    updatedAt: row.updatedAt,
  };
}
