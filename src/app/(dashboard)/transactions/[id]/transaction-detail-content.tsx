"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TransactionProviderModeBadge,
} from "@/components/transactions/transaction-shared";
import {
  getReconciliationLabel,
} from "@/lib/transactions/reconciliation";
import type { TransactionDetail } from "@/types";
import type { SessionUser } from "@/lib/auth/types";

interface TransactionDetailContentProps {
  transaction: TransactionDetail;
  user: SessionUser;
}

export function TransactionDetailContent({
  transaction,
  user,
}: TransactionDetailContentProps) {
  const showClient = user.role !== "MERCHANT_USER";

  const detailRows: Array<{ label: string; value: ReactNode }> = [
    { label: "Transaction ID", value: transaction.transactionId },
    {
      label: "Provider Transaction ID",
      value: transaction.providerTransactionId ?? "—",
    },
    { label: "Provider", value: transaction.provider },
    {
      label: "Provider Mode",
      value: <TransactionProviderModeBadge providerMode={transaction.providerMode} />,
    },
    {
      label: "Payment Status",
      value: <StatusBadge status={transaction.status} />,
    },
    {
      label: "Amount",
      value: <CurrencyDisplay amount={transaction.amount} className="text-lg" />,
    },
  ];

  if (showClient) {
    detailRows.push({
      label: "Client",
      value: `${transaction.clientName} (${transaction.clientCode})`,
    });
  }

  detailRows.push(
    {
      label: "Merchant",
      value: `${transaction.merchantName} (${transaction.merchantCode})`,
    },
    { label: "QR", value: transaction.qrName },
    { label: "QR Identifier", value: transaction.qrIdentifier },
    { label: "Rail", value: transaction.railId ?? "—" },
    { label: "Payment Method", value: transaction.paymentMethod },
    { label: "Reference Number", value: transaction.referenceNumber ?? "—" },
    {
      label: "Bank Reference Number",
      value: transaction.bankReferenceNumber || "—",
    },
    { label: "Customer Name", value: transaction.customerName ?? "—" },
    { label: "Customer VPA", value: transaction.customerVpa },
    {
      label: "Initiated At",
      value: <DateDisplay date={transaction.initiatedAt} />,
    },
    {
      label: "Completed At",
      value: transaction.completedAt ? (
        <DateDisplay date={transaction.completedAt} />
      ) : (
        "—"
      ),
    },
    {
      label: "Created At",
      value: <DateDisplay date={transaction.createdAt} />,
    },
    {
      label: "Reconciliation Status",
      value: (
        <Badge variant="outline">
          {getReconciliationLabel(transaction.reconciliationStatus ?? "UNVERIFIED")}
        </Badge>
      ),
    }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/transactions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Transactions
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Transaction Details"
        description="Read-only payment record. Status changes require trusted provider events."
      />

      <Card>
        <CardHeader>
          <CardTitle>Payment Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {detailRows.map((row) => (
            <div key={row.label} className="space-y-1">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <div className="text-sm font-medium">{row.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event Processing History</CardTitle>
        </CardHeader>
        <CardContent>
          {transaction.paymentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No internal payment events recorded for this transaction.
            </p>
          ) : (
            <div className="space-y-3">
              {transaction.paymentEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border p-3 text-sm"
                >
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      <span className="text-muted-foreground">Received:</span>{" "}
                      <DateDisplay date={event.receivedAt} />
                    </span>
                    {event.processedAt ? (
                      <span>
                        <span className="text-muted-foreground">Processed:</span>{" "}
                        <DateDisplay date={event.processedAt} />
                      </span>
                    ) : null}
                    <span>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      {event.processingStatus}
                    </span>
                    {event.failureReasonCode ? (
                      <span>
                        <span className="text-muted-foreground">Reason:</span>{" "}
                        {event.failureReasonCode}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Payment status, event processing status, and reconciliation status
            are separate concepts. Success does not imply settlement.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
