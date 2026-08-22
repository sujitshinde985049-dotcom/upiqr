import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  canAccessReports,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import {
  getClientsForSelectors,
  getMerchantsForSelectors,
  getQRCodesWithStats,
} from "@/lib/services/data-service";
import { getReportsData } from "@/lib/services/report-service";
import { reportsQuerySchema } from "@/lib/validations/reports";
import {
  ReportsPageContent,
  ReportsPageFallback,
} from "./reports-content";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();

  if (!canAccessReports(user)) {
    notFound();
  }

  const rawParams = await searchParams;
  const queryInput = {
    page: rawParams.page,
    limit: rawParams.limit,
    search: typeof rawParams.search === "string" ? rawParams.search : undefined,
    status: rawParams.status,
    clientId: typeof rawParams.client === "string" ? rawParams.client : undefined,
    merchantId:
      typeof rawParams.merchant === "string" ? rawParams.merchant : undefined,
    qrId: typeof rawParams.qr === "string" ? rawParams.qr : undefined,
    providerMode: rawParams.providerMode,
    dateWindow: rawParams.dateWindow,
    fromDate: typeof rawParams.fromDate === "string" ? rawParams.fromDate : undefined,
    toDate: typeof rawParams.toDate === "string" ? rawParams.toDate : undefined,
    sortBy: rawParams.sortBy,
    sortOrder: rawParams.sortOrder,
  };

  const query = reportsQuerySchema.parse(queryInput);

  const [reports, clients, merchants, qrs] = await Promise.all([
    getReportsData(user, query),
    getClientsForSelectors(user),
    getMerchantsForSelectors(user, query.clientId),
    getQRCodesWithStats(user),
  ]);

  return (
    <Suspense fallback={<ReportsPageFallback />}>
      <ReportsPageContent
        user={user}
        reports={reports}
        clients={clients}
        merchants={merchants}
        qrs={qrs}
      />
    </Suspense>
  );
}
