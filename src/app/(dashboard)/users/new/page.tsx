import { notFound } from "next/navigation";
import {
  canAccessUsersPage,
  canCreateMerchantUser,
  canCreateUsers,
  getAssignableClientUserRoles,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { isSuperAdmin } from "@/lib/auth/types";
import {
  getClientsForSelectors,
  getMerchantsWithStats,
} from "@/lib/services/data-service";
import { UserNewPageContent } from "./user-new-content";

export default async function UserNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();

  if (!canAccessUsersPage(user)) {
    notFound();
  }

  const params = await searchParams;
  const type =
    params.type === "merchant" ? "merchant" : ("client" as "client" | "merchant");
  const defaultClientId =
    typeof params.clientId === "string" ? params.clientId : user.clientId ?? undefined;
  const defaultMerchantId =
    typeof params.merchantId === "string" ? params.merchantId : undefined;

  const [clients, merchants] = await Promise.all([
    isSuperAdmin(user) ? getClientsForSelectors(user) : Promise.resolve([]),
    getMerchantsWithStats(user),
  ]);

  const assignableRoles = getAssignableClientUserRoles(user).map((r) =>
    r === "CLIENT_ADMIN" ? "client_admin" : "client_operator"
  ) as Array<"client_admin" | "client_operator">;

  return (
    <UserNewPageContent
      userType={type}
      clients={clients}
      merchants={merchants}
      isSuperAdmin={isSuperAdmin(user)}
      canCreateClientUsers={canCreateUsers(user)}
      canCreateMerchantUsers={canCreateMerchantUser(user)}
      assignableRoles={assignableRoles}
      defaultClientId={defaultClientId}
      defaultMerchantId={defaultMerchantId}
    />
  );
}
