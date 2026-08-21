import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import type { Column } from "@/components/shared/DataTable";
import type { TransactionWithRelations } from "@/types";
import type { SessionUser } from "@/lib/auth/types";
import { isSuperAdmin } from "@/lib/auth/types";

export function TransactionProviderModeBadge({
  providerMode,
}: {
  providerMode: TransactionWithRelations["providerMode"];
}) {
  if (providerMode === "mock") {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className="border-amber-500 text-amber-700">
          TEST
        </Badge>
        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
          Not a real payment
        </span>
      </div>
    );
  }

  if (providerMode === "legacy") {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className="border-slate-500 text-slate-700">
          LEGACY
        </Badge>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
          Legacy/development data
        </span>
      </div>
    );
  }

  return (
    <Badge variant="outline" className="border-emerald-600 text-emerald-700">
      LIVE
    </Badge>
  );
}

export function buildTransactionListColumns(options: {
  user: SessionUser;
  showClient?: boolean;
  showQr?: boolean;
  linkToDetail?: boolean;
}): Column<TransactionWithRelations>[] {
  const { user, showClient = true, showQr = true, linkToDetail = true } = options;
  const showClientColumn = showClient && user.role !== "MERCHANT_USER";

  const columns: Column<TransactionWithRelations>[] = [
    {
      key: "transactionId",
      header: "Transaction ID",
      cell: (t) =>
        linkToDetail ? (
          <Link
            href={`/transactions/${t.id}`}
            className="font-mono text-xs text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {t.transactionId}
          </Link>
        ) : (
          <span className="font-mono text-xs">{t.transactionId}</span>
        ),
    },
  ];

  if (showClientColumn) {
    columns.push({
      key: "client",
      header: "Bank / Patsanstha",
      cell: (t) => (
        <span className="text-sm text-muted-foreground">{t.clientName}</span>
      ),
    });
  }

  columns.push(
    {
      key: "merchant",
      header: "Merchant",
      cell: (t) => t.merchantName,
    },
    ...(showQr
      ? [
          {
            key: "qr",
            header: "QR",
            cell: (t: TransactionWithRelations) => (
              <span className="font-mono text-xs">{t.qrIdentifier}</span>
            ),
          } as Column<TransactionWithRelations>,
        ]
      : []),
    {
      key: "amount",
      header: "Amount",
      cell: (t) => <CurrencyDisplay amount={t.amount} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: "paymentMethod",
      header: "Payment Method",
      cell: (t) => t.paymentMethod,
    },
    {
      key: "bankReference",
      header: "Bank Reference",
      cell: (t) => (
        <span className="font-mono text-xs">{t.bankReferenceNumber || "—"}</span>
      ),
    },
    {
      key: "providerMode",
      header: "Provider Mode",
      cell: (t) => <TransactionProviderModeBadge providerMode={t.providerMode} />,
    },
    {
      key: "initiatedAt",
      header: "Initiated At",
      cell: (t) => <DateDisplay date={t.initiatedAt} relative />,
    },
    {
      key: "completedAt",
      header: "Completed At",
      cell: (t) =>
        t.completedAt ? (
          <DateDisplay date={t.completedAt} relative />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }
  );

  return columns;
}

export function TransactionSummaryCards({
  summary,
  providerModeFilter,
}: {
  summary: {
    total: number;
    successful: number;
    pending: number;
    failed: number;
    successfulAmount: number;
    successfulAmountByProviderMode: {
      mock: number;
      legacy: number;
      live: number;
    };
  };
  providerModeFilter: "all" | "mock" | "legacy" | "live";
}) {
  const amountLabel =
    providerModeFilter === "all"
      ? "Successful Amount (filtered view)"
      : `Successful Amount (${providerModeFilter.toUpperCase()})`;

  const successfulAmount =
    providerModeFilter === "all"
      ? summary.successfulAmount
      : summary.successfulAmountByProviderMode[providerModeFilter];

  const showMixedWarning =
    providerModeFilter === "all" &&
    (summary.successfulAmountByProviderMode.mock > 0 ||
      summary.successfulAmountByProviderMode.legacy > 0) &&
    summary.successfulAmountByProviderMode.live > 0;

  return (
    <div className="space-y-3">
      {providerModeFilter === "all" && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Summary includes all provider modes in the current filter. MOCK and
            LEGACY amounts are not real settled funds. Payment success does not
            imply settlement.
          </span>
        </div>
      )}
      {showMixedWarning && (
        <p className="text-xs text-muted-foreground">
          MOCK, LEGACY, and LIVE successful amounts are tracked separately and
          must not be combined for live financial reporting.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Total Transactions" value={summary.total} />
        <SummaryCard label="Successful Transactions" value={summary.successful} />
        <SummaryCard label="Pending Transactions" value={summary.pending} />
        <SummaryCard label="Failed Transactions" value={summary.failed} />
        <SummaryCard
          label={amountLabel}
          value={successfulAmount}
          currency
          helper={
            providerModeFilter === "mock" || providerModeFilter === "legacy"
              ? "Test/legacy data — not a real settled total"
              : undefined
          }
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  currency = false,
  helper,
}: {
  label: string;
  value: number;
  currency?: boolean;
  helper?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {currency ? <CurrencyDisplay amount={value} /> : value}
      </p>
      {helper ? <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

export function isSuperAdminUser(user: SessionUser): boolean {
  return isSuperAdmin(user);
}
