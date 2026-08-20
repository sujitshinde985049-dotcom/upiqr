import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  getChartDataForUser,
  getDashboardKPIsForUser,
  getRecentMerchantsForUser,
  getRecentTransactionsForUser,
  getTopPerformingClientsForUser,
} from "@/lib/services/data-service";
import { DashboardPageContent } from "./dashboard-content";

export default async function DashboardPage() {
  const user = await requireAuthenticatedUser();

  const [kpis, todayChart, weekChart, monthChart, recentTransactions, topClients, recentMerchants] =
    await Promise.all([
      getDashboardKPIsForUser(user),
      getChartDataForUser(user, "today"),
      getChartDataForUser(user, "7days"),
      getChartDataForUser(user, "30days"),
      getRecentTransactionsForUser(user, 8),
      getTopPerformingClientsForUser(user, 5),
      getRecentMerchantsForUser(user, 5),
    ]);

  const description =
    user.role === "SUPER_ADMIN"
      ? "Super Admin overview of the MahaCred QR platform"
      : user.role === "MERCHANT_USER"
        ? "Merchant payment overview"
        : "Tenant overview for your institution";

  return (
    <DashboardPageContent
      kpis={kpis}
      chartDataByPeriod={{
        today: todayChart,
        "7days": weekChart,
        "30days": monthChart,
      }}
      recentTransactions={recentTransactions}
      topClients={topClients}
      recentMerchants={recentMerchants}
      description={description}
    />
  );
}
