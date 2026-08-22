"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { MerchantSelector } from "@/components/shared/MerchantSelector";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { Pagination } from "@/components/shared/Pagination";
import { SearchInput } from "@/components/shared/SearchInput";
import { TransactionChart } from "@/components/dashboard/TransactionChart";
import {
  buildTransactionListColumns,
  TransactionProviderModeBadge,
  TransactionSummaryCards,
} from "@/components/transactions/transaction-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onSelectValue } from "@/lib/utils/select";
import type { SessionUser } from "@/lib/auth/types";
import type { ReportsQuery } from "@/lib/validations/reports";
import type {
  Client,
  ClientReportRow,
  Merchant,
  MerchantReportRow,
  QRCodeWithStats,
  QrReportRow,
  ReportsData,
} from "@/types";

interface ReportsPageContentProps {
  user: SessionUser;
  reports: ReportsData;
  clients: Client[];
  merchants: Merchant[];
  qrs: QRCodeWithStats[];
}

function buildQueryString(
  current: ReportsQuery,
  updates: Partial<ReportsQuery>
): string {
  const next = { ...current, ...updates, page: updates.page ?? 1 };
  const params = new URLSearchParams();

  if (next.search) params.set("search", next.search);
  if (next.status !== "all") params.set("status", next.status);
  if (next.clientId) params.set("client", next.clientId);
  if (next.merchantId) params.set("merchant", next.merchantId);
  if (next.qrId) params.set("qr", next.qrId);
  if (next.providerMode !== "all") params.set("providerMode", next.providerMode);
  if (next.dateWindow !== "30days") params.set("dateWindow", next.dateWindow);
  if (next.fromDate) params.set("fromDate", next.fromDate);
  if (next.toDate) params.set("toDate", next.toDate);
  if (next.sortBy !== "initiated_at") params.set("sortBy", next.sortBy);
  if (next.sortOrder !== "desc") params.set("sortOrder", next.sortOrder);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.limit !== 20) params.set("limit", String(next.limit));

  const value = params.toString();
  return value ? `?${value}` : "";
}

function mapExportParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("page");
  params.delete("limit");
  params.delete("dateWindow");

  if (params.has("client")) {
    params.set("clientId", params.get("client")!);
    params.delete("client");
  }
  if (params.has("merchant")) {
    params.set("merchantId", params.get("merchant")!);
    params.delete("merchant");
  }
  if (params.has("qr")) {
    params.set("qrId", params.get("qr")!);
    params.delete("qr");
  }

  return params;
}

export function ReportsPageFallback() {
  return <div className="p-6 text-sm text-muted-foreground">Loading reports...</div>;
}

export function ReportsPageContent({
  user,
  reports,
  clients,
  merchants,
  qrs,
}: ReportsPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { query } = reports;

  const navigate = (updates: Partial<ReportsQuery>) => {
    startTransition(() => {
      router.push(`/reports${buildQueryString(query, updates)}`);
    });
  };

  const filteredQRs = useMemo(() => {
    let filtered = qrs;
    if (query.clientId) {
      filtered = filtered.filter((qr) => qr.clientId === query.clientId);
    }
    if (query.merchantId) {
      filtered = filtered.filter((qr) => qr.merchantId === query.merchantId);
    }
    return filtered;
  }, [qrs, query.clientId, query.merchantId]);

  const transactionColumns = buildTransactionListColumns({
    user,
    showClient: user.role !== "MERCHANT_USER",
  });

  const handleExport = async () => {
    const params = mapExportParams(new URLSearchParams(searchParams.toString()));
    const response = await fetch(`/api/transactions/export?${params.toString()}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      toast.error(body?.error ?? "Export failed");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
      "report-transactions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Report export downloaded");
  };

  const amountLabel =
    query.providerMode === "mock"
      ? "TEST Successful Amount"
      : query.providerMode === "legacy"
        ? "LEGACY Successful Amount"
        : query.providerMode === "live"
          ? "LIVE Successful Amount"
          : "All Transaction Data";

  const clientColumns: Column<ClientReportRow>[] = [
    { key: "client", header: "Client", cell: (r) => r.clientName },
    { key: "total", header: "Transactions", cell: (r) => r.total },
    { key: "successful", header: "Successful", cell: (r) => r.successful },
    { key: "pending", header: "Pending", cell: (r) => r.pending },
    { key: "failed", header: "Failed", cell: (r) => r.failed },
    {
      key: "amount",
      header: "Successful Amount",
      cell: (r) => <CurrencyDisplay amount={r.successfulAmount} />,
    },
  ];

  const merchantColumns: Column<MerchantReportRow>[] = [
    { key: "merchant", header: "Merchant", cell: (r) => r.merchantName },
    { key: "client", header: "Bank / Patsanstha", cell: (r) => r.clientName },
    { key: "total", header: "Transactions", cell: (r) => r.total },
    { key: "successful", header: "Successful", cell: (r) => r.successful },
    { key: "pending", header: "Pending", cell: (r) => r.pending },
    { key: "failed", header: "Failed", cell: (r) => r.failed },
    {
      key: "amount",
      header: "Successful Amount",
      cell: (r) => <CurrencyDisplay amount={r.successfulAmount} />,
    },
  ];

  const qrColumns: Column<QrReportRow>[] = [
    { key: "qr", header: "QR", cell: (r) => r.qrName },
    { key: "merchant", header: "Merchant", cell: (r) => r.merchantName },
    {
      key: "mode",
      header: "Provider Mode",
      cell: (r) => <TransactionProviderModeBadge providerMode={r.providerMode} />,
    },
    { key: "total", header: "Transactions", cell: (r) => r.total },
    { key: "successful", header: "Successful", cell: (r) => r.successful },
    {
      key: "amount",
      header: "Successful Amount",
      cell: (r) => <CurrencyDisplay amount={r.successfulAmount} />,
    },
  ];

  const showClientTab =
    user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN" || user.role === "CLIENT_OPERATOR";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Neon-backed transaction reporting and analytics"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {(query.providerMode === "mock" || query.providerMode === "all") && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {query.providerMode === "mock"
              ? "TEST DATA — NOT REAL PAYMENT COLLECTIONS. Payment success does not imply settlement."
              : `${amountLabel}. MOCK and LEGACY amounts are not LIVE collections. Payment success does not imply settlement.`}
          </span>
        </div>
      )}

      {query.providerMode === "legacy" && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          LEGACY / DEVELOPMENT DATA — not live financial collections.
        </div>
      )}

      <FilterBar>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["today", "Today"],
              ["7days", "Last 7 Days"],
              ["30days", "Last 30 Days"],
              ["custom", "Custom"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={query.dateWindow === value ? "default" : "outline"}
              onClick={() =>
                navigate({
                  dateWindow: value,
                  ...(value !== "custom"
                    ? { fromDate: undefined, toDate: undefined }
                    : {}),
                })
              }
            >
              {label}
            </Button>
          ))}
        </div>
        {query.dateWindow === "custom" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="fromDate">From</Label>
              <Input
                id="fromDate"
                type="date"
                value={query.fromDate?.slice(0, 10) ?? ""}
                onChange={(e) => navigate({ fromDate: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="toDate">To</Label>
              <Input
                id="toDate"
                type="date"
                value={query.toDate?.slice(0, 10) ?? ""}
                onChange={(e) => navigate({ toDate: e.target.value || undefined })}
              />
            </div>
          </>
        )}
        <SearchInput
          value={query.search ?? ""}
          onChange={(value) => navigate({ search: value || undefined })}
          placeholder="Search by ID, reference, merchant, QR..."
        />
        {user.role !== "MERCHANT_USER" && (
          <ClientSelector
            clients={clients}
            value={query.clientId}
            onChange={(value) =>
              navigate({
                clientId: value,
                merchantId: undefined,
                qrId: undefined,
              })
            }
            includeAll
            className="w-48"
          />
        )}
        {user.role !== "MERCHANT_USER" && (
          <MerchantSelector
            merchants={merchants}
            value={query.merchantId}
            onChange={(value) =>
              navigate({ merchantId: value, qrId: undefined })
            }
            clientId={query.clientId}
            includeAll
            className="w-48"
          />
        )}
        <Select
          value={query.qrId ?? "all"}
          onValueChange={(value) =>
            navigate({
              qrId: !value || value === "all" ? undefined : value,
            })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="QR" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All QR Codes</SelectItem>
            {filteredQRs.map((qr) => (
              <SelectItem key={qr.id} value={qr.id}>
                {qr.qrName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.status} onValueChange={onSelectValue((value) => navigate({ status: value as ReportsQuery["status"] }))}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={query.providerMode}
          onValueChange={onSelectValue((value) =>
            navigate({ providerMode: value as ReportsQuery["providerMode"] })
          )}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Provider Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Transaction Data</SelectItem>
            <SelectItem value="mock">TEST (MOCK)</SelectItem>
            <SelectItem value="legacy">LEGACY</SelectItem>
            <SelectItem value="live">LIVE</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <TransactionSummaryCards
        summary={reports.summary}
        providerModeFilter={query.providerMode}
      />

      <TransactionChart
        data={reports.chartData}
        title="Transaction Trend (Successful Amount)"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider Mode Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {reports.providerModeBreakdown.map((row) => (
              <div key={row.providerMode} className="rounded-lg border p-4">
                <TransactionProviderModeBadge providerMode={row.providerMode} />
                <div className="mt-3 space-y-1 text-sm">
                  <p>Transactions: {row.total}</p>
                  <p>Successful: {row.successful}</p>
                  <p>Pending: {row.pending}</p>
                  <p>Failed: {row.failed}</p>
                  <p className="font-medium">
                    Successful Amount: <CurrencyDisplay amount={row.successfulAmount} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          {showClientTab && user.role === "SUPER_ADMIN" && (
            <TabsTrigger value="client">Client-wise</TabsTrigger>
          )}
          {user.role !== "MERCHANT_USER" && (
            <TabsTrigger value="merchant">Merchant-wise</TabsTrigger>
          )}
          <TabsTrigger value="qr">QR-wise</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-4 space-y-4">
          <DataTable
            columns={transactionColumns}
            data={reports.transactions.items}
            emptyTitle="No transactions found for selected filters"
          />
          <Pagination
            page={reports.transactions.pagination.page}
            totalPages={reports.transactions.pagination.totalPages}
            total={reports.transactions.pagination.total}
            pageSize={reports.transactions.pagination.limit}
            itemLabel="transactions"
            onPageChange={(page) => navigate({ page })}
          />
        </TabsContent>

        {showClientTab && user.role === "SUPER_ADMIN" && (
          <TabsContent value="client" className="mt-4">
            <DataTable
              columns={clientColumns}
              data={reports.clientRows}
              emptyTitle="No client report data for selected filters"
            />
          </TabsContent>
        )}

        {user.role !== "MERCHANT_USER" && (
          <TabsContent value="merchant" className="mt-4">
            <DataTable
              columns={merchantColumns}
              data={reports.merchantRows}
              emptyTitle="No merchant report data for selected filters"
            />
          </TabsContent>
        )}

        <TabsContent value="qr" className="mt-4">
          <DataTable
            columns={qrColumns}
            data={reports.qrRows}
            emptyTitle="No QR report data for selected filters"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
