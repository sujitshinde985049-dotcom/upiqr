"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  QrCode,
  ArrowLeftRight,
  IndianRupee,
  TrendingUp,
  Pencil,
  Power,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import {
  buildMerchantScopedTransactionColumns,
} from "@/components/transactions/transaction-scoped-columns";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { GenerateQRDialog } from "@/components/qr/GenerateQRDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-currency";
import { updateMerchantStatusAction } from "@/lib/actions/merchant-actions";
import type {
  Client,
  Merchant,
  MerchantWithStats,
  QRCode,
  TransactionWithRelations,
  User,
} from "@/types";

interface MerchantStats {
  activeQrCodes: number;
  todayTransactions: number;
  todayCollection: number;
  totalCollection: number;
  transactionCount: number;
}

interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: Date;
  metadata: unknown;
  user: { name: string; email: string } | null;
}

interface MerchantDetailPageContentProps {
  merchant: Merchant & { clientName: string };
  stats: MerchantStats;
  qrs: (QRCode & { merchantName: string; clientName: string })[];
  transactions: TransactionWithRelations[];
  clients: Client[];
  merchants: MerchantWithStats[];
  activity: AuditLogEntry[];
  merchantUsers: User[];
  canEditMerchant: boolean;
  canManageStatus: boolean;
  canCreateMerchantUsers: boolean;
}

export function MerchantDetailPageContent({
  merchant,
  stats,
  qrs,
  transactions,
  clients,
  merchants,
  activity,
  merchantUsers,
  canEditMerchant,
  canManageStatus,
  canCreateMerchantUsers,
}: MerchantDetailPageContentProps) {
  const router = useRouter();
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isActivating = merchant.status !== "active";

  const handleStatusChange = async () => {
    const action = merchant.status === "active" ? "deactivate" : "activate";
    const result = await updateMerchantStatusAction({
      merchantId: merchant.id,
      action,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(
      action === "activate" ? "Merchant activated" : "Merchant deactivated",
      { description: merchant.businessName }
    );
    setConfirmOpen(false);
    router.refresh();
  };

  const qrColumns: Column<QRCode & { merchantName: string }>[] = [
    {
      key: "id",
      header: "QR ID",
      cell: (q) => (
        <Link href={`/qr-codes/${q.id}`} className="font-mono text-xs text-primary hover:underline">
          {q.id}
        </Link>
      ),
    },
    { key: "name", header: "QR Name", cell: (q) => q.qrName },
    { key: "identifier", header: "Identifier", cell: (q) => q.qrIdentifier },
    { key: "rail", header: "Rail", cell: (q) => q.railId },
    {
      key: "status",
      header: "Status",
      cell: (q) => <StatusBadge status={q.status} />,
    },
  ];

  const txnColumns = buildMerchantScopedTransactionColumns();

  return (
    <div className="space-y-6">
      <PageHeader
        title={merchant.businessName}
        description={`Merchant Code: ${merchant.merchantCode}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={merchant.status} />
            {canEditMerchant && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/merchants/${merchant.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
            )}
            {canManageStatus && (
              <Button
                variant={isActivating ? "default" : "destructive"}
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                <Power className="mr-2 h-4 w-4" />
                {isActivating ? "Activate" : "Deactivate"}
              </Button>
            )}
            <Button onClick={() => setQrOpen(true)}>
              <QrCode className="mr-2 h-4 w-4" />
              Generate QR
            </Button>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        Parent Bank / Patsanstha:{" "}
        <Link href={`/clients/${merchant.clientId}`} className="text-primary hover:underline">
          {merchant.clientName}
        </Link>
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active QR Codes" value={stats.activeQrCodes} icon={QrCode} />
        <StatCard title="Transaction Count" value={stats.transactionCount} icon={ArrowLeftRight} />
        <StatCard title="Today's Collection" value={formatCurrency(stats.todayCollection)} icon={IndianRupee} />
        <StatCard title="Total Collection" value={formatCurrency(stats.totalCollection)} icon={TrendingUp} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="qr">QR Codes</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Merchant Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Merchant Code</p>
                <p className="font-mono text-sm font-medium">{merchant.merchantCode}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Business Name</p>
                <p className="text-sm font-medium">{merchant.businessName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account Holder</p>
                <p className="text-sm font-medium">{merchant.accountHolderName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Account</p>
                <p className="font-mono text-sm font-medium">
                  {merchant.maskedCurrentAccountReference}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="text-sm font-medium">{merchant.merchantCategory ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Business Type</p>
                <p className="text-sm font-medium">{merchant.businessType ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">GST</p>
                <p className="text-sm font-medium">{merchant.gstNumber ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PAN</p>
                <p className="text-sm font-medium">{merchant.pan ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mobile</p>
                <p className="text-sm font-medium">{merchant.mobile}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{merchant.email ?? "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="text-sm font-medium">
                  {merchant.address}, {merchant.city}, {merchant.district},{" "}
                  {merchant.state} - {merchant.pinCode}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created At</p>
                <p className="text-sm font-medium">
                  <DateDisplay date={merchant.createdAt} />
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr" className="mt-4">
          <div className="mb-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            SabPaisa contract mock mode: generate TEST QR codes (NOT PAYABLE). No live
            SabPaisa API call is made.
          </div>
          <DataTable columns={qrColumns} data={qrs} emptyTitle="No QR codes" />
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <DataTable columns={txnColumns} data={transactions} emptyTitle="No transactions" />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {canCreateMerchantUsers && (
                <div className="mb-4 flex justify-end">
                  <Button size="sm" asChild>
                    <Link
                      href={`/users/new?type=merchant&merchantId=${merchant.id}&clientId=${merchant.clientId}`}
                    >
                      Add Merchant User
                    </Link>
                  </Button>
                </div>
              )}
              {merchantUsers.length > 0 ? (
                <div className="space-y-3">
                  {merchantUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <StatusBadge status={u.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No merchant users assigned to this merchant.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between rounded-lg border p-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{entry.action}</Badge>
                          {entry.user && (
                            <span className="text-xs text-muted-foreground">
                              by {entry.user.name}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <DateDisplay date={entry.createdAt.toISOString()} />
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No activity recorded for this merchant yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GenerateQRDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        merchants={[merchant]}
        defaultMerchantId={merchant.id}
        lockMerchant
      />

      {canManageStatus && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={isActivating ? "Activate Merchant" : "Deactivate Merchant"}
          description={
            isActivating
              ? `Activate ${merchant.businessName}? The merchant will be able to operate on the platform.`
              : `Deactivate ${merchant.businessName}? Historical QR and transaction data will be preserved.`
          }
          confirmLabel={isActivating ? "Activate" : "Deactivate"}
          destructive={!isActivating}
          onConfirm={handleStatusChange}
        />
      )}
    </div>
  );
}
