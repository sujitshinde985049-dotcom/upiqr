import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { getDashboardData } from "@/lib/services/dashboard-service";
import type { DashboardQuery } from "@/lib/validations/dashboard";
import { DashboardPageContent } from "./dashboard-content";

interface DashboardPageProps {
  searchParams: Promise<{
    dateWindow?: string;
    providerMode?: string;
    clientId?: string;
    merchantId?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireAuthenticatedUser();
  const params = await searchParams;

  const query: Partial<DashboardQuery> = {
    dateWindow: params.dateWindow as DashboardQuery["dateWindow"] | undefined,
    providerMode: params.providerMode as DashboardQuery["providerMode"] | undefined,
    clientId: params.clientId,
    merchantId: params.merchantId,
  };

  const dashboard = await getDashboardData(user, query);

  const description =
    user.role === "SUPER_ADMIN"
      ? "Super Admin operational overview of the MahaCred QR platform"
      : user.role === "MERCHANT_USER"
        ? "Merchant payment overview"
        : "Tenant operational overview for your institution";

  return (
    <DashboardPageContent
      user={user}
      dashboard={dashboard}
      description={description}
    />
  );
}
