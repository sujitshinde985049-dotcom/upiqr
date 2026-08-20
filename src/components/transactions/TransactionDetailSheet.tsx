"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import type { TransactionWithRelations } from "@/types";

interface TransactionDetailSheetProps {
  transaction: TransactionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailSheet({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailSheetProps) {
  if (!transaction) return null;

  const rows = [
    { label: "Transaction ID", value: transaction.transactionId },
    { label: "Status", value: <StatusBadge status={transaction.status} /> },
    {
      label: "Amount",
      value: <CurrencyDisplay amount={transaction.amount} className="text-lg" />,
    },
    { label: "Merchant", value: transaction.merchantName },
    { label: "Bank / Patsanstha", value: transaction.clientName },
    { label: "QR", value: transaction.qrName },
    { label: "QR Identifier", value: transaction.qrIdentifier },
    { label: "Customer VPA", value: transaction.customerVpa },
    { label: "Bank Reference Number", value: transaction.bankReferenceNumber },
    { label: "Payment Method", value: transaction.paymentMethod },
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
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Transaction Details</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <span className="text-sm font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
