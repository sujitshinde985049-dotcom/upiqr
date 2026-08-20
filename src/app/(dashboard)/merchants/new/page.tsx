import { redirect } from "next/navigation";
import {
  canCreateMerchant,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { isSuperAdmin } from "@/lib/auth/types";
import { getClientsForSelectors } from "@/lib/services/data-service";
import { MerchantNewPageContent } from "./merchant-new-content";

export default async function MerchantNewPage() {
  const user = await requireAuthenticatedUser();

  if (!canCreateMerchant(user)) {
    redirect("/merchants");
  }

  const clients = isSuperAdmin(user)
    ? await getClientsForSelectors(user)
    : [];

  return (
    <MerchantNewPageContent
      clients={clients}
      isSuperAdmin={isSuperAdmin(user)}
      defaultClientId={user.clientId ?? undefined}
    />
  );
}
