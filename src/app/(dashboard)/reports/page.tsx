import { notFound } from "next/navigation";
import {
  canAccessReports,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import {
  getChartDataForUser,
  getClientsForSelectors,
  getClientsWithStats,
  getMerchantsForSelectors,
  getMerchantsWithStats,
  getQRCodesWithStats,
  getTransactionsWithRelations,
} from "@/lib/services/data-service";
import { ReportsPageContent } from "./reports-content";

export default async function ReportsPage() {
  const user = await requireAuthenticatedUser();

  if (!canAccessReports(user)) {
    notFound();
  }

  const [
    chartData,
    clientsWithStats,
    merchantsWithStats,
    qrCodesWithStats,
    initialTransactions,
    clients,
    merchants,
  ] = await Promise.all([
    getChartDataForUser(user, { dateWindow: "30days", providerMode: "all" }),
    getClientsWithStats(user),
    getMerchantsWithStats(user),
    getQRCodesWithStats(user),
    getTransactionsWithRelations(user),
    getClientsForSelectors(user),
    getMerchantsForSelectors(user),
  ]);

  return (
    <ReportsPageContent
      chartData={chartData}
      clientsWithStats={clientsWithStats}
      merchantsWithStats={merchantsWithStats}
      qrCodesWithStats={qrCodesWithStats}
      initialTransactions={initialTransactions}
      clients={clients}
      merchants={merchants}
    />
  );
}
