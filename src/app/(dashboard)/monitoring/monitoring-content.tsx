"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { MerchantSelector } from "@/components/shared/MerchantSelector";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { StatCard } from "@/components/shared/StatCard";
import { TransactionProviderModeBadge } from "@/components/transactions/transaction-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onSelectValue } from "@/lib/utils/select";
import type { SessionUser } from "@/lib/auth/types";
import { isSuperAdmin } from "@/lib/auth/types";
import type { MonitoringQuery } from "@/lib/validations/monitoring";
import type {
  AuditActivityRow,
  Client,
  FailedTransactionRow,
  Merchant,
  MonitoringData,
  PaymentEventRow,
  PendingTransactionRow,
  QrOperationalRow,
} from "@/types";

interface MonitoringPageContentProps {
  user: SessionUser;
  monitoring: MonitoringData;
  clients: Client[];
  merchants: Merchant[];
}

function buildQueryString(
  current: MonitoringQuery,
  updates: Partial<MonitoringQuery>
): string {
  const next = { ...current, ...updates };
  const params = new URLSearchParams();

  if (next.dateWindow !== "7days") params.set("dateWindow", next.dateWindow);
  if (next.providerMode !== "all") params.set("providerMode", next.providerMode);
  if (next.clientId) params.set("client", next.clientId);
  if (next.merchantId) params.set("merchant", next.merchantId);
  if (next.transactionStatus !== "all") {
    params.set("transactionStatus", next.transactionStatus);
  }
  if (next.eventProcessingStatus !== "all") {
    params.set("eventProcessingStatus", next.eventProcessingStatus);
  }

  const value = params.toString();
  return value ? `?${value}` : "";
}

function pendingAgeLabel(bucket: PendingTransactionRow["ageBucket"]): string {
  switch (bucket) {
    case "recent":
      return "Recent";
    case "aging":
      return "Aging";
    case "older":
      return "Older";
  }
}

const pendingColumns: Column<PendingTransactionRow>[] = [
  {
    key: "transactionId",
    header: "Transaction ID",
    cell: (row) => (
      <Link
        href={`/transactions/${row.id}`}
        className="font-mono text-xs text-primary hover:underline"
      >
        {row.transactionId}
      </Link>
    ),
  },
  { key: "merchant", header: "Merchant", cell: (row) => row.merchantName },
  { key: "qr", header: "QR", cell: (row) => row.qrName },
  {
    key: "amount",
    header: "Amount",
    cell: (row) => <CurrencyDisplay amount={row.amount} />,
  },
  {
    key: "providerMode",
    header: "Provider Mode",
    cell: (row) => <TransactionProviderModeBadge providerMode={row.providerMode} />,
  },
  {
    key: "createdAt",
    header: "Created At",
    cell: (row) => <DateDisplay date={row.initiatedAt} />,
  },
  {
    key: "age",
    header: "Age",
    cell: (row) => (
      <div className="flex flex-col gap-1">
        <span>{row.ageMinutes} min</span>
        <Badge variant="outline">{pendingAgeLabel(row.ageBucket)}</Badge>
      </div>
    ),
  },
];

const failedColumns: Column<FailedTransactionRow>[] = [
  {
    key: "transactionId",
    header: "Transaction ID",
    cell: (row) => (
      <Link
        href={`/transactions/${row.id}`}
        className="font-mono text-xs text-primary hover:underline"
      >
        {row.transactionId}
      </Link>
    ),
  },
  { key: "merchant", header: "Merchant", cell: (row) => row.merchantName },
  { key: "qr", header: "QR", cell: (row) => row.qrName },
  {
    key: "amount",
    header: "Amount",
    cell: (row) => <CurrencyDisplay amount={row.amount} />,
  },
  {
    key: "providerMode",
    header: "Provider Mode",
    cell: (row) => <TransactionProviderModeBadge providerMode={row.providerMode} />,
  },
  {
    key: "createdAt",
    header: "Created At",
    cell: (row) => <DateDisplay date={row.initiatedAt} />,
  },
  {
    key: "reference",
    header: "Reference",
    cell: (row) => row.referenceNumber ?? "—",
  },
];

const eventColumns: Column<PaymentEventRow>[] = [
  { key: "id", header: "Event ID", cell: (row) => row.id },
  { key: "provider", header: "Provider", cell: (row) => row.provider },
  {
    key: "providerMode",
    header: "Provider Mode",
    cell: (row) => <TransactionProviderModeBadge providerMode={row.providerMode} />,
  },
  {
    key: "status",
    header: "Processing Status",
    cell: (row) => row.processingStatus,
  },
  {
    key: "receivedAt",
    header: "Received",
    cell: (row) => <DateDisplay date={row.receivedAt} />,
  },
  {
    key: "processedAt",
    header: "Processed",
    cell: (row) =>
      row.processedAt ? <DateDisplay date={row.processedAt} /> : "—",
  },
  {
    key: "reason",
    header: "Reason Code",
    cell: (row) => row.failureReasonCode ?? "—",
  },
];

const qrColumns: Column<QrOperationalRow>[] = [
  {
    key: "qr",
    header: "QR",
    cell: (row) => (
      <Link href={`/qr-codes/${row.id}`} className="text-primary hover:underline">
        {row.qrName}
      </Link>
    ),
  },
  { key: "merchant", header: "Merchant", cell: (row) => row.merchantName },
  {
    key: "providerMode",
    header: "Provider Mode",
    cell: (row) => <TransactionProviderModeBadge providerMode={row.providerMode} />,
  },
  { key: "status", header: "Status", cell: (row) => row.status },
  {
    key: "payable",
    header: "Payable",
    cell: (row) => (row.isPayable ? "Yes" : "No (TEST)"),
  },
  {
    key: "activity",
    header: "Recent Transactions",
    cell: (row) => row.recentTransactionCount,
  },
];

const auditColumns: Column<AuditActivityRow>[] = [
  { key: "action", header: "Action", cell: (row) => row.action },
  { key: "actor", header: "Actor", cell: (row) => row.actorName ?? "System" },
  { key: "entityType", header: "Entity Type", cell: (row) => row.entityType },
  {
    key: "entityId",
    header: "Entity ID",
    cell: (row) => row.entityId ?? "—",
  },
  {
    key: "createdAt",
    header: "Timestamp",
    cell: (row) => <DateDisplay date={row.createdAt} />,
  },
];

export function MonitoringPageContent({
  user,
  monitoring,
  clients,
  merchants,
}: MonitoringPageContentProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { summary, query } = monitoring;
  const showClientFilter = isSuperAdmin(user);
  const showMerchantFilter = user.role !== "MERCHANT_USER";

  function navigate(updates: Partial<MonitoringQuery>) {
    startTransition(() => {
      router.push(`/monitoring${buildQueryString(query, updates)}`);
    });
  }

  const modeWarning =
    query.providerMode === "mock"
      ? "TEST DATA — NOT REAL PAYMENT COLLECTIONS"
      : query.providerMode === "legacy"
        ? "LEGACY / DEVELOPMENT DATA"
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operational Monitoring"
        description="Read-only operational visibility. Monitoring does not mutate payment state. Payment success does not imply settlement."
      />

      {modeWarning && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{modeWarning}</span>
        </div>
      )}

      <FilterBar>
        <Select
          value={query.dateWindow}
          onValueChange={onSelectValue((value) =>
            navigate({ dateWindow: value as MonitoringQuery["dateWindow"] })
          )}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Date window" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>

        {showClientFilter && (
          <ClientSelector
            clients={clients}
            value={query.clientId}
            onChange={(value) =>
              navigate({ clientId: value, merchantId: undefined })
            }
            includeAll
            className="w-48"
          />
        )}

        {showMerchantFilter && (
          <MerchantSelector
            merchants={merchants}
            value={query.merchantId}
            onChange={(value) => navigate({ merchantId: value })}
            clientId={query.clientId}
            includeAll
            className="w-48"
          />
        )}

        <Select
          value={query.providerMode}
          onValueChange={onSelectValue((value) =>
            navigate({ providerMode: value as MonitoringQuery["providerMode"] })
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

        <Select
          value={query.eventProcessingStatus}
          onValueChange={onSelectValue((value) =>
            navigate({
              eventProcessingStatus:
                value as MonitoringQuery["eventProcessingStatus"],
            })
          )}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Event Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Event Statuses</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="duplicate">Duplicate</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operational Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Active QR Codes" value={summary.activeQrCodes} />
          <StatCard title="Inactive QR Codes" value={summary.inactiveQrCodes} />
          <StatCard title="MOCK QR Codes" value={summary.mockQrCodes} />
          <StatCard title="Pending Transactions" value={summary.pendingTransactions} />
          <StatCard title="Failed Transactions" value={summary.failedTransactions} />
          <StatCard title="Successful Transactions" value={summary.successfulTransactions} />
          <StatCard title="Received Events" value={summary.receivedPaymentEvents} />
          <StatCard title="Processed Events" value={summary.processedPaymentEvents} />
          <StatCard title="Rejected Events" value={summary.rejectedPaymentEvents} />
          <StatCard title="Failed Events" value={summary.failedPaymentEvents} />
          <StatCard title="Duplicate Events" value={summary.duplicatePaymentEvents} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Age buckets: Recent (&lt;{15} min), Aging (15–60 min), Older (&gt;60 min).
            Operational indicator only — aged pending transactions are not marked failed.
          </p>
          <DataTable
            columns={pendingColumns}
            data={monitoring.pendingTransactions}
            emptyTitle="No pending transactions in selected scope"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Failed Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={failedColumns}
            data={monitoring.failedTransactions}
            emptyTitle="No failed transactions in selected scope"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Event Processing</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={eventColumns}
            data={monitoring.recentPaymentEvents}
            emptyTitle="No payment events in selected scope"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">QR Operational Status</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={qrColumns}
            data={monitoring.qrOverview}
            emptyTitle="No QR codes in selected scope"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={auditColumns}
            data={monitoring.recentAuditActivity}
            emptyTitle="No audit activity in selected scope"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integration Readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <p>
              <span className="font-medium">Current mode:</span>{" "}
              {monitoring.integrationReadiness.integrationMode}
            </p>
            <p>
              <span className="font-medium">Live QR provider:</span>{" "}
              {monitoring.integrationReadiness.liveQrProvider}
            </p>
            <p>
              <span className="font-medium">Live transaction provider:</span>{" "}
              {monitoring.integrationReadiness.liveTransactionProvider}
            </p>
            <p>
              <span className="font-medium">Public webhook:</span>{" "}
              {monitoring.integrationReadiness.publicWebhook}
            </p>
            <p>
              <span className="font-medium">API crypto interoperability:</span>{" "}
              {monitoring.integrationReadiness.apiCryptoInteroperability}
            </p>
            <p>
              <span className="font-medium">Webhook interoperability:</span>{" "}
              {monitoring.integrationReadiness.webhookInteroperability}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
