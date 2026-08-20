import { notFound } from "next/navigation";
import {
  canAccessUsersPage,
  AuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { isSuperAdmin } from "@/lib/auth/types";
import type { SessionUser } from "@/lib/auth/types";
import {
  getClientByIdForUser,
  getClientStatsForUser,
  getMerchantsByClientIdForUser,
  getQRCodesByClientIdForUser,
  getTransactionsWithRelations,
} from "@/lib/services/data-service";
import { getUsersByClientIdForUser } from "@/lib/services/user-service";
import { ClientDetailPageContent } from "./client-detail-content";

async function loadClientDetail(id: string, user: SessionUser) {
  try {
    const client = await getClientByIdForUser(id, user);
    if (!client) return null;

    const [stats, merchants, qrs, transactions, clientUsers] = await Promise.all([
      getClientStatsForUser(id, user),
      getMerchantsByClientIdForUser(id, user),
      getQRCodesByClientIdForUser(id, user),
      getTransactionsWithRelations(user, { clientId: id }),
      getUsersByClientIdForUser(id, user),
    ]);

    return {
      client,
      stats,
      merchants,
      qrs,
      transactions,
      users: clientUsers,
      canManageUsers: canAccessUsersPage(user),
    };
  } catch (error) {
    if (error instanceof AuthError && error.code === "FORBIDDEN") {
      return null;
    }
    throw error;
  }
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const data = await loadClientDetail(id, user);

  if (!data) notFound();

  return (
    <ClientDetailPageContent
      {...data}
      canManageClient={isSuperAdmin(user)}
    />
  );
}
