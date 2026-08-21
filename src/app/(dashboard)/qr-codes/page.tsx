import { Suspense } from "react";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  getClientsForSelectors,
  getMerchantsForSelectors,
} from "@/lib/services/data-service";
import { listMerchantQRs } from "@/lib/services/qr-service";
import { qrListQuerySchema } from "@/lib/validations/qr";
import {
  QRCodesPageContent,
  QRCodesPageFallback,
} from "./qr-codes-content";

export default async function QRCodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();
  const rawParams = await searchParams;
  const query = qrListQuerySchema.parse({
    page: rawParams.page,
    limit: rawParams.limit,
    search: typeof rawParams.search === "string" ? rawParams.search : undefined,
    status: rawParams.status,
    category: typeof rawParams.category === "string" ? rawParams.category : undefined,
    fromDate: typeof rawParams.fromDate === "string" ? rawParams.fromDate : undefined,
    toDate: typeof rawParams.toDate === "string" ? rawParams.toDate : undefined,
    sortBy: rawParams.sortBy,
    sortOrder: rawParams.sortOrder,
    railId: rawParams.railId,
  });

  const [result, clients, merchants] = await Promise.all([
    listMerchantQRs(user, query),
    getClientsForSelectors(user),
    getMerchantsForSelectors(user),
  ]);

  return (
    <Suspense fallback={<QRCodesPageFallback />}>
      <QRCodesPageContent
        key={`${query.page}-${query.search ?? ""}-${query.status}-${query.railId}-${query.sortBy}-${query.sortOrder}`}
        result={result}
        query={query}
        clients={clients}
        merchants={merchants}
      />
    </Suspense>
  );
}
