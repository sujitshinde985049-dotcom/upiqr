import { notFound } from "next/navigation";
import {
  canAccessMonitoring,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import {
  getClientsForSelectors,
  getMerchantsForSelectors,
} from "@/lib/services/data-service";
import { getMonitoringData } from "@/lib/services/monitoring-service";
import { monitoringQuerySchema } from "@/lib/validations/monitoring";
import { MonitoringPageContent } from "./monitoring-content";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();

  if (!canAccessMonitoring(user)) {
    notFound();
  }

  const rawParams = await searchParams;
  const query = monitoringQuerySchema.parse({
    dateWindow: rawParams.dateWindow,
    providerMode: rawParams.providerMode,
    clientId: typeof rawParams.client === "string" ? rawParams.client : undefined,
    merchantId:
      typeof rawParams.merchant === "string" ? rawParams.merchant : undefined,
    transactionStatus: rawParams.transactionStatus,
    eventProcessingStatus: rawParams.eventProcessingStatus,
  });

  const [monitoring, clients, merchants] = await Promise.all([
    getMonitoringData(user, query),
    getClientsForSelectors(user),
    getMerchantsForSelectors(user, query.clientId),
  ]);

  return (
    <MonitoringPageContent
      user={user}
      monitoring={monitoring}
      clients={clients}
      merchants={merchants}
    />
  );
}
