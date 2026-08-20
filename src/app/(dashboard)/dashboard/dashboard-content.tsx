"use client";

import { useState } from "react";
import {
  Building2,
  Store,
  QrCode,
  ArrowLeftRight,
  IndianRupee,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { TransactionChart } from "@/components/dashboard/TransactionChart";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { TopClients } from "@/components/dashboard/TopClients";
import { RecentMerchants } from "@/components/dashboard/RecentMerchants";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format-currency";
import type {
  ChartDataPoint,
  ClientWithStats,
  DashboardKPIs,
  MerchantWithStats,
  TransactionWithRelations,
} from "@/types";

type Period = "today" | "7days" | "30days";

interface DashboardPageContentProps {
  kpis: DashboardKPIs;
  chartDataByPeriod: Record<Period, ChartDataPoint[]>;
  recentTransactions: TransactionWithRelations[];
  topClients: ClientWithStats[];
  recentMerchants: MerchantWithStats[];
  description: string;
}

export function DashboardPageContent({
  kpis,
  chartDataByPeriod,
  recentTransactions,
  topClients,
  recentMerchants,
  description,
}: DashboardPageContentProps) {
  const [period, setPeriod] = useState<Period>("7days");

  const periods: { value: Period; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "7days", label: "7 Days" },
    { value: "30days", label: "30 Days" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={description} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Banks / Patsansthas" value={kpis.totalClients} icon={Building2} />
        <StatCard title="Total Merchants" value={kpis.totalMerchants} icon={Store} />
        <StatCard title="Active QR Codes" value={kpis.activeQrCodes} icon={QrCode} />
        <StatCard title="Today's Transactions" value={kpis.todayTransactions} icon={ArrowLeftRight} />
        <StatCard title="Today's Collection" value={formatCurrency(kpis.todayCollection)} icon={IndianRupee} />
        <StatCard title="Total Collection" value={formatCurrency(kpis.totalCollection)} icon={TrendingUp} />
      </div>

      <div className="flex items-center gap-2">
        {periods.map((p) => (
          <Button
            key={p.value}
            variant={period === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <TransactionChart data={chartDataByPeriod[period]} />
      <RecentTransactions transactions={recentTransactions} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TopClients clients={topClients} />
        <RecentMerchants merchants={recentMerchants} />
      </div>
    </div>
  );
}
