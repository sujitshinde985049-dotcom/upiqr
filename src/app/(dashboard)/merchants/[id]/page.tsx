import { notFound } from "next/navigation";
import {
  AuthError,
  canEditMerchant,
  canManageMerchantStatus,
  canCreateMerchantUser,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import {
  getClientsForSelectors,
  getMerchantByIdForUser,
  getMerchantStatsForUser,
  getMerchantsWithStats,
  getQRCodesByMerchantIdForUser,
  getTransactionsWithRelations,
} from "@/lib/services/data-service";
import { getMerchantAuditLogs } from "@/lib/services/merchant-service";
import { getUsersByMerchantIdForUser } from "@/lib/services/user-service";
import type { SessionUser } from "@/lib/auth/types";
import { MerchantDetailPageContent } from "./merchant-detail-content";

async function loadMerchantDetail(id: string, user: SessionUser) {
  try {
    const merchant = await getMerchantByIdForUser(id, user);
    if (!merchant) return null;

    const [stats, qrs, transactions, clients, merchants, activity, merchantUsers] =
      await Promise.all([
        getMerchantStatsForUser(id, user),
        getQRCodesByMerchantIdForUser(id, user),
        getTransactionsWithRelations(user, { merchantId: id }),
        getClientsForSelectors(user),
        getMerchantsWithStats(user),
        getMerchantAuditLogs(id),
        getUsersByMerchantIdForUser(id, user),
      ]);

    if (!stats) return null;

    return {
      merchant,
      stats: {
        ...stats,
        transactionCount: transactions.length,
      },
      qrs,
      transactions,
      clients,
      merchants,
      activity,
      merchantUsers,
      canEditMerchant: canEditMerchant(user),
      canManageStatus: canManageMerchantStatus(user),
      canCreateMerchantUsers: canCreateMerchantUser(user),
    };
  } catch (error) {
    if (error instanceof AuthError && error.code === "FORBIDDEN") {
      return null;
    }
    throw error;
  }
}

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const data = await loadMerchantDetail(id, user);

  if (!data) notFound();

  return <MerchantDetailPageContent {...data} />;
}
