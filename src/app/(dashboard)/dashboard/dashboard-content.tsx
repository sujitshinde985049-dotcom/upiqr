"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Store,
  QrCode,
  ArrowLeftRight,
  IndianRupee,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { TransactionChart } from "@/components/dashboard/TransactionChart";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { TopClients } from "@/components/dashboard/TopClients";
import { RecentMerchants } from "@/components/dashboard/RecentMerchants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { TransactionSummaryCards } from "@/components/transactions/transaction-shared";
import type { SessionUser } from "@/lib/auth/types";
import type { DashboardData } from "@/types";

type DateWindow = DashboardData["query"]["dateWindow"];
type ProviderMode = DashboardData["query"]["providerMode"];

interface DashboardPageContentProps {
  user: SessionUser;
  dashboard: DashboardData;
  description: string;
}

const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 Days" },
  { value: "30days", label: "Last 30 Days" },
];

const PROVIDER_MODES: { value: ProviderMode; label: string }[] = [
  { value: "all", label: "All Modes" },
  { value: "mock", label: "TEST (MOCK)" },
  { value: "legacy", label: "LEGACY" },
  { value: "live", label: "LIVE" },
];

export function DashboardPageContent({
  user,
  dashboard,
  description,
}: DashboardPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { metrics, chartData, recentTransactions, topClients, recentMerchants, qrOverview, merchantOverview, query } =
    dashboard;

  const updateQuery = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  const isMerchantUser = user.role === "MERCHANT_USER";
  const showClientSections = !isMerchantUser && topClients.length > 0;
  const showMerchantSections = !isMerchantUser && recentMerchants.length > 0;

  const amountLabel =
    query.providerMode === "mock"
      ? "TEST Successful Amount"
      : query.providerMode === "legacy"
        ? "LEGACY Successful Amount"
        : query.providerMode === "live"
          ? "LIVE Successful Amount"
          : "Successful Amount (filtered)";

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={description} />

      {(query.providerMode === "mock" || query.providerMode === "all") && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {query.providerMode === "mock"
              ? "TEST DATA — NOT REAL PAYMENT COLLECTIONS. Payment success does not imply settlement."
              : "Operational dashboard. MOCK and LEGACY amounts are not LIVE collections. Payment success does not imply settlement."}
          </span>
        </div>
      )}

      {query.providerMode === "legacy" && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          LEGACY / DEVELOPMENT DATA — not live financial collections.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {DATE_WINDOWS.map((window) => (
          <Button
            key={window.value}
            variant={query.dateWindow === window.value ? "default" : "outline"}
            size="sm"
            onClick={() => updateQuery({ dateWindow: window.value })}
          >
            {window.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PROVIDER_MODES.map((mode) => (
          <Button
            key={mode.value}
            variant={query.providerMode === mode.value ? "default" : "outline"}
            size="sm"
            onClick={() => updateQuery({ providerMode: mode.value })}
          >
            {mode.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {metrics.showPlatformClients && (
          <StatCard
            title="Banks / Patsansthas"
            value={metrics.totalClients}
            icon={Building2}
          />
        )}
        {!isMerchantUser && (
          <>
            <StatCard title="Total Merchants" value={metrics.totalMerchants} icon={Store} />
            <StatCard title="Active Merchants" value={metrics.activeMerchants} icon={Store} />
          </>
        )}
        <StatCard title="Total QR Codes" value={metrics.totalQrCodes} icon={QrCode} />
        <StatCard title="Active QR Codes" value={metrics.activeQrCodes} icon={QrCode} />
        <StatCard
          title="Transactions (window)"
          value={metrics.totalTransactions}
          icon={ArrowLeftRight}
        />
        <StatCard
          title={amountLabel}
          value={formatCurrency(metrics.successfulAmount)}
          icon={IndianRupee}
        />
      </div>

      <TransactionSummaryCards
        summary={{
          total: metrics.totalTransactions,
          successful: metrics.successfulTransactions,
          pending: metrics.pendingTransactions,
          failed: metrics.failedTransactions,
          successfulAmount: metrics.successfulAmount,
          successfulAmountByProviderMode: metrics.successfulAmountByProviderMode,
        }}
        providerModeFilter={query.providerMode}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <OverviewCard title="QR Overview">
          <OverviewRow label="Total QR" value={qrOverview.total} />
          <OverviewRow label="Active QR" value={qrOverview.active} />
          <OverviewRow label="Inactive QR" value={qrOverview.inactive} />
          <OverviewRow
            label="TEST QR (MOCK)"
            value={qrOverview.mock}
            badge="NOT PAYABLE"
          />
          <Link href="/qr-codes" className="mt-3 inline-block text-sm text-primary hover:underline">
            View QR codes
          </Link>
        </OverviewCard>

        {merchantOverview ? (
          <OverviewCard title="Merchant Overview">
            <OverviewRow label="Total Merchants" value={merchantOverview.total} />
            <OverviewRow label="Active" value={merchantOverview.active} />
            <OverviewRow label="Pending" value={merchantOverview.pending} />
            <OverviewRow label="Inactive" value={merchantOverview.inactive} />
            <Link href="/merchants" className="mt-3 inline-block text-sm text-primary hover:underline">
              View merchants
            </Link>
          </OverviewCard>
        ) : (
          <OverviewCard title="Merchant Overview">
            <p className="text-sm text-muted-foreground">
              Scoped to your merchant account.
            </p>
            <Link href="/merchants" className="mt-3 inline-block text-sm text-primary hover:underline">
              View merchant
            </Link>
          </OverviewCard>
        )}
      </div>

      <TransactionChart data={chartData} />
      <RecentTransactions user={user} transactions={recentTransactions} />

      {(showClientSections || showMerchantSections) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {showClientSections ? <TopClients clients={topClients} /> : null}
          {showMerchantSections ? <RecentMerchants merchants={recentMerchants} /> : null}
        </div>
      )}
    </div>
  );
}

function OverviewCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: number;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-medium">
        {value}
        {badge ? (
          <Badge variant="outline" className="border-amber-500 text-[10px] text-amber-700">
            {badge}
          </Badge>
        ) : null}
      </span>
    </div>
  );
}
