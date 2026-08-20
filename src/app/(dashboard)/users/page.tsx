import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  canAccessUsersPage,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { isSuperAdmin } from "@/lib/auth/types";
import { getClientsForSelectors } from "@/lib/services/data-service";
import { getUsersPaginated } from "@/lib/services/user-service";
import { userListQuerySchema } from "@/lib/validations/users";
import type { Client } from "@/types";
import { UsersPageContent, UsersPageFallback } from "./users-content";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();

  if (!canAccessUsersPage(user)) {
    notFound();
  }

  const rawParams = await searchParams;
  const query = userListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    search: typeof rawParams.search === "string" ? rawParams.search : undefined,
    role: rawParams.role,
    status: rawParams.status,
    clientId: typeof rawParams.clientId === "string" ? rawParams.clientId : undefined,
  });

  const [result, clients] = await Promise.all([
    getUsersPaginated(user, query),
    isSuperAdmin(user) ? getClientsForSelectors(user) : Promise.resolve([]),
  ]);

  const clientNameMap = Object.fromEntries(
    clients.map((c: Client) => [c.id, c.name])
  );

  return (
    <Suspense fallback={<UsersPageFallback />}>
      <UsersPageContent
        key={`${query.page}-${query.search ?? ""}-${query.role}-${query.status}-${query.clientId ?? ""}`}
        result={result}
        query={query}
        clientNameMap={clientNameMap}
        clients={clients}
        isSuperAdmin={isSuperAdmin(user)}
      />
    </Suspense>
  );
}
