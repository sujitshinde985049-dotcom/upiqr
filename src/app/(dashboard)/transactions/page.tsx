import { Suspense } from "react";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  getClientsForSelectors,
  getMerchantsForSelectors,
  getQRCodesWithStats,
} from "@/lib/services/data-service";
import { listManagedTransactions } from "@/lib/services/transaction-management-service";
import { transactionManagementQuerySchema } from "@/lib/validations/transactions";
import {
  TransactionsPageContent,
  TransactionsPageFallback,
} from "./transactions-content";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();
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
    fromDate: typeof rawParams.fromDate === "string" ? rawParams.fromDate : undefined,
    toDate: typeof rawParams.toDate === "string" ? rawParams.toDate : undefined,
    sortBy: rawParams.sortBy,
    sortOrder: rawParams.sortOrder,
  };

  const query = transactionManagementQuerySchema.parse(queryInput);

  const [clients, merchants, qrs, result] = await Promise.all([
    getClientsForSelectors(user),
    getMerchantsForSelectors(user),
    getQRCodesWithStats(user),
    listManagedTransactions(user, query),
  ]);

  return (
    <Suspense fallback={<TransactionsPageFallback />}>
      <TransactionsPageContent
        clients={clients}
        merchants={merchants}
        qrs={qrs}
        result={result}
        query={query}
        user={user}
      />
    </Suspense>
  );
}
