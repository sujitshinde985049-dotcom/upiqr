import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  canCreateMerchant,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { isSuperAdmin } from "@/lib/auth/types";
import { getClientsForSelectors } from "@/lib/services/data-service";
import { getMerchantsPaginated } from "@/lib/services/merchant-service";
import { merchantListQuerySchema } from "@/lib/validations/merchants";
import {
  MerchantsPageContent,
  MerchantsPageFallback,
} from "./merchants-content";

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();

  if (user.role === "MERCHANT_USER" && user.merchantId) {
    redirect(`/merchants/${user.merchantId}`);
  }

  const rawParams = await searchParams;
  const query = merchantListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    search: typeof rawParams.search === "string" ? rawParams.search : undefined,
    status: rawParams.status,
    clientId: typeof rawParams.clientId === "string" ? rawParams.clientId : undefined,
    category: typeof rawParams.category === "string" ? rawParams.category : undefined,
    sort: rawParams.sort,
  });

  const [result, clients] = await Promise.all([
    getMerchantsPaginated(user, query),
    isSuperAdmin(user) ? getClientsForSelectors(user) : Promise.resolve([]),
  ]);

  return (
    <Suspense fallback={<MerchantsPageFallback />}>
      <MerchantsPageContent
        key={`${query.page}-${query.search ?? ""}-${query.status}-${query.clientId ?? ""}-${query.category ?? ""}-${query.sort}`}
        result={result}
        query={query}
        clients={clients}
        canCreateMerchant={canCreateMerchant(user)}
        canEditMerchant={user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN"}
        isSuperAdmin={isSuperAdmin(user)}
      />
    </Suspense>
  );
}
