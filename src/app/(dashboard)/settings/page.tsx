import { notFound } from "next/navigation";
import {
  canAccessSettings,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";
import { getIntegrationReadiness } from "@/lib/services/monitoring-service";
import {
  canManagePlatformSettings,
  getClientSettings,
  getPlatformSettings,
  resolveClientSettingsClientId,
} from "@/lib/services/settings-service";
import { SettingsPageContent } from "./settings-content";

interface SettingsPageProps {
  searchParams: Promise<{ clientId?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireAuthenticatedUser();

  if (!canAccessSettings(user)) {
    notFound();
  }

  const params = await searchParams;
  const integrationReadiness = getIntegrationReadiness();
  const canEditPlatform = canManagePlatformSettings(user);

  let platformSettings = null;
  let clientSettings = null;
  let clients: { id: string; name: string }[] = [];
  let selectedClientId: string | null = null;

  if (canEditPlatform) {
    platformSettings = await getPlatformSettings();
    clients = await prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    selectedClientId =
      params.clientId && clients.some((client) => client.id === params.clientId)
        ? params.clientId
        : clients[0]?.id ?? null;

    if (selectedClientId) {
      clientSettings = await getClientSettings(user, selectedClientId);
    }
  } else if (user.clientId) {
    selectedClientId = user.clientId;
    clientSettings = await getClientSettings(user, user.clientId);
  }

  const resolved = resolveClientSettingsClientId(user, selectedClientId);
  const canEditClient = !("error" in resolved);

  return (
    <SettingsPageContent
      key={`${selectedClientId ?? "none"}-${clientSettings?.updatedAt?.toISOString() ?? "new"}-${platformSettings?.updatedAt?.toISOString() ?? "new"}`}
      userRole={user.role}
      platformSettings={platformSettings}
      clientSettings={clientSettings}
      clients={clients}
      selectedClientId={selectedClientId}
      integrationReadiness={integrationReadiness}
      canEditPlatform={canEditPlatform}
      canEditClient={canEditClient}
    />
  );
}
