import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  canAccessClientsList,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { getClientsPaginated } from "@/lib/services/client-service";
import { clientListQuerySchema } from "@/lib/validations/clients";
import {
  ClientsPageContent,
  ClientsPageFallback,
} from "./clients-content";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();

  if (!canAccessClientsList(user)) {
    if (user.clientId) {
      redirect(`/clients/${user.clientId}`);
    }
    redirect("/dashboard");
  }

  const rawParams = await searchParams;
  const query = clientListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    search: typeof rawParams.search === "string" ? rawParams.search : undefined,
    type: rawParams.type,
    status: rawParams.status,
  });

  const result = await getClientsPaginated(user, query);

  return (
    <Suspense fallback={<ClientsPageFallback />}>
      <ClientsPageContent
        key={`${query.page}-${query.search ?? ""}-${query.type}-${query.status}`}
        result={result}
        query={query}
        canAddClient={canAccessClientsList(user)}
      />
    </Suspense>
  );
}
