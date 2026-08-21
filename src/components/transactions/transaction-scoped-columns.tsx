import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import type { Column } from "@/components/shared/DataTable";
import {
  TransactionProviderModeBadge,
} from "@/components/transactions/transaction-shared";
import type { TransactionWithRelations } from "@/types";

export function buildMerchantScopedTransactionColumns(): Column<TransactionWithRelations>[] {
  return [
    {
      key: "transactionId",
      header: "Transaction ID",
      cell: (t) => (
        <Link
          href={`/transactions/${t.id}`}
          className="font-mono text-xs text-primary hover:underline"
        >
          {t.transactionId}
        </Link>
      ),
    },
    {
      key: "qr",
      header: "QR",
      cell: (t) => <span className="font-mono text-xs">{t.qrIdentifier}</span>,
    },
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
      key: "providerMode",
      header: "Provider Mode",
      cell: (t) => <TransactionProviderModeBadge providerMode={t.providerMode} />,
    },
    {
      key: "date",
      header: "Date",
      cell: (t) => <DateDisplay date={t.initiatedAt} relative />,
    },
  ];
}

export function buildClientScopedTransactionColumns(): Column<TransactionWithRelations>[] {
  return [
    {
      key: "transactionId",
      header: "Transaction ID",
      cell: (t) => (
        <Link
          href={`/transactions/${t.id}`}
          className="font-mono text-xs text-primary hover:underline"
        >
          {t.transactionId}
        </Link>
      ),
    },
    { key: "merchant", header: "Merchant", cell: (t) => t.merchantName },
    {
      key: "qr",
      header: "QR",
      cell: (t) => <span className="font-mono text-xs">{t.qrIdentifier}</span>,
    },
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
      key: "providerMode",
      header: "Provider Mode",
      cell: (t) => <TransactionProviderModeBadge providerMode={t.providerMode} />,
    },
    {
      key: "date",
      header: "Date",
      cell: (t) => <DateDisplay date={t.initiatedAt} relative />,
    },
  ];
}

export function buildQrScopedTransactionColumns(): Column<TransactionWithRelations>[] {
  return [
    {
      key: "transactionId",
      header: "Transaction ID",
      cell: (t) => (
        <Link
          href={`/transactions/${t.id}`}
          className="font-mono text-xs text-primary hover:underline"
        >
          {t.transactionId}
        </Link>
      ),
    },
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
      cell: (t) => t.paymentMethod || "—",
    },
    {
      key: "customerName",
      header: "Customer Name",
      cell: (t) => t.customerName || "—",
    },
    {
      key: "vpa",
      header: "Customer VPA",
      cell: (t) => (
        <span className="font-mono text-xs">{t.customerVpa || "—"}</span>
      ),
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
      cell: (t) => <DateDisplay date={t.initiatedAt} />,
    },
    {
      key: "completedAt",
      header: "Completed At",
      cell: (t) =>
        t.completedAt ? <DateDisplay date={t.completedAt} /> : "—",
    },
  ];
}
