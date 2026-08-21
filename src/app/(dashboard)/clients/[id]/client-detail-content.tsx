"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Store,
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
import {
  buildClientScopedTransactionColumns,
} from "@/components/transactions/transaction-scoped-columns";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EditClientDialog } from "@/components/clients/EditClientDialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format-currency";
import { updateClientStatusAction } from "@/lib/actions/client-actions";
import type {
  Client,
  Merchant,
  QRCode,
  TransactionWithRelations,
  User,
} from "@/types";

interface ClientStats {
  totalMerchants: number;
  activeMerchants: number;
  activeQrs: number;
  todayTransactions: number;
  todayCollection: number;
  totalCollection: number;
}

interface ClientDetailPageContentProps {
  client: Client;
  stats: ClientStats;
  merchants: Merchant[];
  qrs: (QRCode & { merchantName: string; clientName: string })[];
  transactions: TransactionWithRelations[];
  users: User[];
  canManageClient: boolean;
  canManageUsers: boolean;
}

export function ClientDetailPageContent({
  client,
  stats,
  merchants,
  qrs,
  transactions,
  users: clientUsers,
  canManageClient,
  canManageUsers,
}: ClientDetailPageContentProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isActivating = client.status !== "active";

  const handleStatusChange = async () => {
    const action = client.status === "active" ? "deactivate" : "activate";
    const result = await updateClientStatusAction({
      clientId: client.id,
      action,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(
      action === "activate" ? "Client activated" : "Client deactivated",
      { description: client.name }
    );
    setConfirmOpen(false);
    router.refresh();
  };

  const merchantColumns: Column<Merchant>[] = [
    {
      key: "merchantCode",
      header: "Merchant Code",
      cell: (m) => (
        <Link href={`/merchants/${m.id}`} className="font-mono text-xs text-primary hover:underline">
          {m.merchantCode}
        </Link>
      ),
    },
    { key: "name", header: "Business Name", cell: (m) => m.businessName },
    { key: "account", header: "Account Holder", cell: (m) => m.accountHolderName },
    {
      key: "currentAccount",
      header: "Current Account",
      cell: (m) => (
        <span className="font-mono text-xs">{m.maskedCurrentAccountReference}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (m) => <StatusBadge status={m.status} />,
    },
  ];

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
    { key: "merchant", header: "Merchant", cell: (q) => q.merchantName },
    { key: "rail", header: "Rail", cell: (q) => q.railId },
    {
      key: "status",
      header: "Status",
      cell: (q) => <StatusBadge status={q.status} />,
    },
  ];

  const txnColumns = buildClientScopedTransactionColumns();

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.name}
        description={`Client Code: ${client.clientCode}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={client.status} />
            {canManageClient && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant={isActivating ? "default" : "destructive"}
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Power className="mr-2 h-4 w-4" />
                  {isActivating ? "Activate" : "Deactivate"}
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="capitalize">
          {client.type}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Tenant: {client.name}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Total Merchants" value={stats.totalMerchants} icon={Store} />
        <StatCard title="Active Merchants" value={stats.activeMerchants} icon={Store} />
        <StatCard title="Active QRs" value={stats.activeQrs} icon={QrCode} />
        <StatCard title="Today's Transactions" value={stats.todayTransactions} icon={ArrowLeftRight} />
        <StatCard title="Today's Collection" value={formatCurrency(stats.todayCollection)} icon={IndianRupee} />
        <StatCard title="Total Collection" value={formatCurrency(stats.totalCollection)} icon={TrendingUp} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="qr">QR Codes</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Institution Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Client Code</p>
                <p className="font-mono text-sm font-medium">{client.clientCode}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contact Person</p>
                <p className="text-sm font-medium">{client.contactPerson}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mobile</p>
                <p className="text-sm font-medium">{client.mobile}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{client.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Registration</p>
                <p className="text-sm font-medium">{client.registrationNumber}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="text-sm font-medium">
                  {client.address}, {client.city}, {client.district},{" "}
                  {client.state} - {client.pinCode}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merchants" className="mt-4">
          <DataTable columns={merchantColumns} data={merchants} emptyTitle="No merchants" />
        </TabsContent>

        <TabsContent value="qr" className="mt-4">
          <DataTable columns={qrColumns} data={qrs} emptyTitle="No QR codes" />
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <DataTable columns={txnColumns} data={transactions} emptyTitle="No transactions" />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {canManageUsers && (
                <div className="mb-4 flex justify-end">
                  <Button size="sm" asChild>
                    <Link href={`/users/new?clientId=${client.id}`}>Add User</Link>
                  </Button>
                </div>
              )}
              {clientUsers.length > 0 ? (
                <div className="space-y-3">
                  {clientUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {u.role.replace(/_/g, " ")}
                        </Badge>
                        <StatusBadge status={u.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No users assigned to this client.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Client settings will be configurable in a future phase.
              </p>
              <Button variant="outline" className="mt-4" disabled>
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {canManageClient && (
        <>
          <EditClientDialog
            client={client}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={isActivating ? "Activate Client" : "Deactivate Client"}
            description={
              isActivating
                ? `Activate ${client.name}? The institution will be able to operate on the platform.`
                : `Deactivate ${client.name}? The institution will no longer be active on the platform.`
            }
            confirmLabel={isActivating ? "Activate" : "Deactivate"}
            destructive={!isActivating}
            onConfirm={handleStatusChange}
          />
        </>
      )}
    </div>
  );
}
