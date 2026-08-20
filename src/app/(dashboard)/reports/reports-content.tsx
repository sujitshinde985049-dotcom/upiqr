"use client";

import { useState, useMemo } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { FilterBar } from "@/components/shared/FilterBar";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { MerchantSelector } from "@/components/shared/MerchantSelector";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/format-currency";
import { onSelectValue } from "@/lib/utils/select";
import type {
  ChartDataPoint,
  Client,
  ClientWithStats,
  Merchant,
  MerchantWithStats,
  QRCodeWithStats,
  TransactionStatus,
  TransactionWithRelations,
} from "@/types";

interface ReportsPageContentProps {
  chartData: ChartDataPoint[];
  clientsWithStats: ClientWithStats[];
  merchantsWithStats: MerchantWithStats[];
  qrCodesWithStats: QRCodeWithStats[];
  initialTransactions: TransactionWithRelations[];
  clients: Client[];
  merchants: Merchant[];
}

function filterTransactions(
  transactions: TransactionWithRelations[],
  filters: {
    clientId?: string;
    merchantId?: string;
    status?: TransactionStatus;
    dateFrom?: string;
    dateTo?: string;
  }
): TransactionWithRelations[] {
  let results = transactions;

  if (filters.clientId) {
    results = results.filter((t) => t.clientId === filters.clientId);
  }
  if (filters.merchantId) {
    results = results.filter((t) => t.merchantId === filters.merchantId);
  }
  if (filters.status) {
    results = results.filter((t) => t.status === filters.status);
  }
  if (filters.dateFrom) {
    results = results.filter(
      (t) => new Date(t.initiatedAt) >= new Date(filters.dateFrom!)
    );
  }
  if (filters.dateTo) {
    results = results.filter(
      (t) => new Date(t.initiatedAt) <= new Date(filters.dateTo!)
    );
  }

  return results;
}

export function ReportsPageContent({
  chartData,
  clientsWithStats,
  merchantsWithStats,
  qrCodesWithStats,
  initialTransactions,
  clients,
  merchants,
}: ReportsPageContentProps) {
  const [clientFilter, setClientFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const transactions = useMemo(
    () =>
      filterTransactions(initialTransactions, {
        clientId: clientFilter !== "all" ? clientFilter : undefined,
        merchantId: merchantFilter !== "all" ? merchantFilter : undefined,
        status: statusFilter !== "all" ? (statusFilter as TransactionStatus) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [initialTransactions, clientFilter, merchantFilter, statusFilter, dateFrom, dateTo]
  );

  const totalCollection = transactions
    .filter((t) => t.status === "success")
    .reduce((sum, t) => sum + t.amount, 0);
  const successCount = transactions.filter((t) => t.status === "success").length;
  const failedCount = transactions.filter((t) => t.status === "failed").length;
  const pendingCount = transactions.filter((t) => t.status === "pending").length;

  const clientReport = clientsWithStats.map((c) => ({
    id: c.id,
    name: c.name,
    merchants: c.totalMerchants,
    collection: c.totalCollection,
    today: c.todayCollection,
  }));

  const merchantReport = merchantsWithStats
    .filter((m) => clientFilter === "all" || m.clientId === clientFilter)
    .map((m) => ({
      id: m.id,
      name: m.businessName,
      client: m.clientName,
      qrs: m.qrCount,
      collection: m.totalCollection,
    }));

  const qrReport = qrCodesWithStats
    .filter((q) => {
      if (clientFilter !== "all" && q.clientId !== clientFilter) return false;
      if (merchantFilter !== "all" && q.merchantId !== merchantFilter) return false;
      return true;
    })
    .map((q) => ({
      id: q.id,
      name: q.qrName,
      merchant: q.merchantName,
      transactions: q.transactionCount,
      collection: q.collection,
    }));

  const handleExport = () => {
    toast.success("CSV export started (Demo)", {
      description: "Report download is simulated in Phase 1.",
    });
  };

  const clientColumns: Column<(typeof clientReport)[0]>[] = [
    { key: "name", header: "Client", cell: (r) => r.name },
    { key: "merchants", header: "Merchants", cell: (r) => r.merchants },
    {
      key: "today",
      header: "Today's Collection",
      cell: (r) => <CurrencyDisplay amount={r.today} />,
    },
    {
      key: "total",
      header: "Total Collection",
      cell: (r) => <CurrencyDisplay amount={r.collection} />,
    },
  ];

  const merchantColumns: Column<(typeof merchantReport)[0]>[] = [
    { key: "name", header: "Merchant", cell: (r) => r.name },
    { key: "client", header: "Bank / Patsanstha", cell: (r) => r.client },
    { key: "qrs", header: "QR Codes", cell: (r) => r.qrs },
    {
      key: "collection",
      header: "Collection",
      cell: (r) => <CurrencyDisplay amount={r.collection} />,
    },
  ];

  const qrColumns: Column<(typeof qrReport)[0]>[] = [
    { key: "name", header: "QR Name", cell: (r) => r.name },
    { key: "merchant", header: "Merchant", cell: (r) => r.merchant },
    { key: "txns", header: "Transactions", cell: (r) => r.transactions },
    {
      key: "collection",
      header: "Collection",
      cell: (r) => <CurrencyDisplay amount={r.collection} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Collection and transaction analytics across the platform"
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <FilterBar>
        <ClientSelector
          clients={clients}
          value={clientFilter === "all" ? undefined : clientFilter}
          onChange={setClientFilter}
          includeAll
          className="w-48"
        />
        <MerchantSelector
          merchants={merchants}
          value={merchantFilter === "all" ? undefined : merchantFilter}
          onChange={setMerchantFilter}
          clientId={clientFilter !== "all" ? clientFilter : undefined}
          includeAll
          className="w-48"
        />
        <Select value={statusFilter} onValueChange={onSelectValue(setStatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Collection" value={formatCurrency(totalCollection)} />
        <StatCard title="Successful" value={successCount} />
        <StatCard title="Pending" value={pendingCount} />
        <StatCard title="Failed" value={failedCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection Trend (30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => [
                    formatCurrency(Number(value ?? 0)),
                    "Collection",
                  ]}
                />
                <Bar dataKey="amount" fill="hsl(220 50% 35%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="client">
        <TabsList>
          <TabsTrigger value="client">Client-wise</TabsTrigger>
          <TabsTrigger value="merchant">Merchant-wise</TabsTrigger>
          <TabsTrigger value="qr">QR-wise</TabsTrigger>
        </TabsList>
        <TabsContent value="client" className="mt-4">
          <DataTable columns={clientColumns} data={clientReport} />
        </TabsContent>
        <TabsContent value="merchant" className="mt-4">
          <DataTable columns={merchantColumns} data={merchantReport} />
        </TabsContent>
        <TabsContent value="qr" className="mt-4">
          <DataTable columns={qrColumns} data={qrReport} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
