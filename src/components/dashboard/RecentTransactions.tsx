"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { TransactionWithRelations } from "@/types";

interface RecentTransactionsProps {
  transactions: TransactionWithRelations[];
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  const columns: Column<TransactionWithRelations>[] = [
    {
      key: "transactionId",
      header: "Transaction ID",
      cell: (t) => (
        <span className="font-mono text-xs">{t.transactionId}</span>
      ),
    },
    {
      key: "merchant",
      header: "Merchant",
      cell: (t) => t.merchantName,
    },
    {
      key: "client",
      header: "Bank / Patsanstha",
      cell: (t) => (
        <span className="text-sm text-muted-foreground">{t.clientName}</span>
      ),
    },
    {
      key: "qr",
      header: "QR",
      cell: (t) => (
        <span className="font-mono text-xs">{t.qrIdentifier}</span>
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
      key: "date",
      header: "Date & Time",
      cell: (t) => <DateDisplay date={t.initiatedAt} relative />,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">
          Recent Transactions
        </CardTitle>
        <Link
          href="/transactions"
          className="text-sm text-primary hover:underline"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={columns}
          data={transactions}
          emptyTitle="No transactions yet"
        />
      </CardContent>
    </Card>
  );
}
