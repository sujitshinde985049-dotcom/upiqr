"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { buildTransactionListColumns } from "@/components/transactions/transaction-shared";
import type { SessionUser } from "@/lib/auth/types";
import type { TransactionWithRelations } from "@/types";

interface RecentTransactionsProps {
  user: SessionUser;
  transactions: TransactionWithRelations[];
}

export function RecentTransactions({ user, transactions }: RecentTransactionsProps) {
  const columns = buildTransactionListColumns({
    user,
    showClient: user.role !== "MERCHANT_USER",
    showQr: true,
    linkToDetail: true,
  }).filter((column) =>
    ["transactionId", "merchant", "qr", "amount", "status", "providerMode", "initiatedAt"].includes(
      column.key
    )
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Recent Transactions</CardTitle>
        <Link href="/transactions" className="text-sm text-primary hover:underline">
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
