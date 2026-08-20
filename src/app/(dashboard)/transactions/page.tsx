import { Suspense } from "react";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  getClientsForSelectors,
  getMerchantsForSelectors,
  getQRCodesWithStats,
  getTransactionsWithRelations,
} from "@/lib/services/data-service";
import {
  TransactionsPageContent,
  TransactionsPageFallback,
} from "./transactions-content";

export default async function TransactionsPage() {
  const user = await requireAuthenticatedUser();

  const [clients, merchants, qrs, initialTransactions] = await Promise.all([
    getClientsForSelectors(user),
    getMerchantsForSelectors(user),
    getQRCodesWithStats(user),
    getTransactionsWithRelations(user),
  ]);

  return (
    <Suspense fallback={<TransactionsPageFallback />}>
      <TransactionsPageContent
        clients={clients}
        merchants={merchants}
        qrs={qrs}
        initialTransactions={initialTransactions}
      />
    </Suspense>
  );
}
