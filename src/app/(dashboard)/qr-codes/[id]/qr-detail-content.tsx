"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Power, ArrowLeftRight, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { QRPreview } from "@/components/qr/QRPreview";
import { ProviderModeBadge } from "@/components/qr/ProviderModeBadge";
import { EditQRDialog } from "@/components/qr/EditQRDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format-currency";
import {
  deactivateQRAction,
  reactivateQRAction,
} from "@/lib/actions/qr-actions";
import type { QRCode, TransactionWithRelations } from "@/types";

interface QRStats {
  total: number;
  successful: number;
  failed: number;
  pending: number;
  collection: number;
}

interface QRDetailPageContentProps {
  qr: QRCode & { merchantName: string; clientName: string };
  stats: QRStats;
  transactions: TransactionWithRelations[];
}

export function QRDetailPageContent({
  qr,
  stats,
  transactions,
}: QRDetailPageContentProps) {
  const router = useRouter();
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const txnColumns: Column<TransactionWithRelations>[] = [
    {
      key: "id",
      header: "Transaction ID",
      cell: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{t.transactionId}</span>
          {(t.providerMode === "mock" || t.providerMode === "legacy") && (
            <ProviderModeBadge mode={t.providerMode} isPayable={false} />
          )}
        </div>
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={qr.qrName}
        description={`QR ID: ${qr.id}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProviderModeBadge mode={qr.providerMode} isPayable={qr.isPayable} />
            <StatusBadge status={qr.status} />
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/qr/${qr.id}/download?format=png&size=512`} download>
                <Download className="mr-2 h-4 w-4" />
                Download QR
              </a>
            </Button>
            {qr.status === "active" ? (
              <Button variant="destructive" onClick={() => setDeactivateOpen(true)}>
                <Power className="mr-2 h-4 w-4" />
                Deactivate
              </Button>
            ) : (
              <Button onClick={() => setReactivateOpen(true)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reactivate
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/transactions?qr=${qr.id}`}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                View Transactions
              </Link>
            </Button>
          </div>
        }
      />

      {(qr.providerMode === "mock" || !qr.isPayable) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          TEST QR — NOT PAYABLE. This QR was generated in SabPaisa contract mock mode and
          must not be used for live payments.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6">
            <QRPreview
              qrId={qr.id}
              vpa={qr.vpa}
              merchantName={qr.merchantName}
              size={180}
              isPayable={qr.isPayable}
              providerMode={qr.providerMode}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">QR Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">QR Identifier</p>
              <p className="font-mono text-sm font-medium">{qr.qrIdentifier}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">VPA</p>
              <p className="font-mono text-sm font-medium">{qr.vpa}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Merchant</p>
              <Link
                href={`/merchants/${qr.merchantId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {qr.merchantName}
              </Link>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bank / Patsanstha</p>
              <Link
                href={`/clients/${qr.clientId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {qr.clientName}
              </Link>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Provider Reference</p>
              <p className="font-mono text-sm font-medium">{qr.sabpaisaQrId ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Integration Mode</p>
              <p className="text-sm font-medium uppercase">{qr.providerMode}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Payable</p>
              <p className="text-sm font-medium">{qr.isPayable ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created Date</p>
              <DateDisplay date={qr.createdAt} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Transactions</p>
              <p className="text-sm font-medium">{stats.total}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Amount</p>
              <CurrencyDisplay amount={stats.collection} />
            </div>
            {qr.maxAmountPerTransaction && (
              <div>
                <p className="text-xs text-muted-foreground">Max Amount / Transaction</p>
                <CurrencyDisplay amount={qr.maxAmountPerTransaction} />
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Payment Rail</p>
              <p className="text-sm font-medium">{qr.railId}</p>
            </div>
            {qr.upiString && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Test UPI Representation</p>
                <p className="break-all font-mono text-xs font-medium">{qr.upiString}</p>
              </div>
            )}
            {qr.description && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm font-medium">{qr.description}</p>
              </div>
            )}
            {qr.category && (
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="text-sm font-medium">{qr.category}</p>
              </div>
            )}
            {qr.notes && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm font-medium">{qr.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Transactions" value={stats.total} />
        <StatCard title="Successful" value={stats.successful} />
        <StatCard title="Failed" value={stats.failed} />
        <StatCard title="Total Collection" value={formatCurrency(stats.collection)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={txnColumns}
            data={transactions}
            emptyTitle="No transactions for this QR"
          />
        </CardContent>
      </Card>

      <EditQRDialog qr={qr} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate this QR?"
        description={`Are you sure you want to deactivate "${qr.qrName}"?`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          const result = await deactivateQRAction(qr.id);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("QR code deactivated");
          setDeactivateOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title="Reactivate this QR?"
        description={`Reactivate "${qr.qrName}" without creating a duplicate QR record.`}
        confirmLabel="Reactivate"
        onConfirm={async () => {
          const result = await reactivateQRAction(qr.id);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("QR code reactivated");
          setReactivateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
