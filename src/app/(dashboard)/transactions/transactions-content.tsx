"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { MerchantSelector } from "@/components/shared/MerchantSelector";
import { TransactionDetailSheet } from "@/components/transactions/TransactionDetailSheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onSelectValue } from "@/lib/utils/select";
import type {
  Client,
  Merchant,
  QRCodeWithStats,
  TransactionStatus,
  TransactionWithRelations,
} from "@/types";

interface TransactionsPageContentProps {
  clients: Client[];
  merchants: Merchant[];
  qrs: QRCodeWithStats[];
  initialTransactions: TransactionWithRelations[];
}

function filterTransactions(
  transactions: TransactionWithRelations[],
  filters: {
    clientId?: string;
    merchantId?: string;
    qrId?: string;
    status?: TransactionStatus;
    search?: string;
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
  if (filters.qrId) {
    results = results.filter((t) => t.qrId === filters.qrId);
  }
  if (filters.status) {
    results = results.filter((t) => t.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (t) =>
        t.transactionId.toLowerCase().includes(q) ||
        t.merchantName.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.customerVpa.toLowerCase().includes(q) ||
        t.bankReferenceNumber.toLowerCase().includes(q)
    );
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

  return results.sort(
    (a, b) =>
      new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime()
  );
}

export function TransactionsPageContent({
  clients,
  merchants,
  qrs,
  initialTransactions,
}: TransactionsPageContentProps) {
  const searchParams = useSearchParams();
  const qrParam = searchParams.get("qr");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [qrFilter, setQrFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTxn, setSelectedTxn] = useState<TransactionWithRelations | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeQrFilter = qrParam ?? qrFilter;

  const transactions = useMemo(() => {
    return filterTransactions(initialTransactions, {
      clientId: clientFilter !== "all" ? clientFilter : undefined,
      merchantId: merchantFilter !== "all" ? merchantFilter : undefined,
      qrId: activeQrFilter !== "all" ? activeQrFilter : undefined,
      status: statusFilter !== "all" ? (statusFilter as TransactionStatus) : undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  }, [
    initialTransactions,
    search,
    clientFilter,
    merchantFilter,
    activeQrFilter,
    statusFilter,
    dateFrom,
    dateTo,
  ]);

  const filteredQRs = useMemo(() => {
    let filtered = qrs;
    if (clientFilter !== "all") filtered = filtered.filter((q) => q.clientId === clientFilter);
    if (merchantFilter !== "all") filtered = filtered.filter((q) => q.merchantId === merchantFilter);
    return filtered;
  }, [qrs, clientFilter, merchantFilter]);

  const columns: Column<TransactionWithRelations>[] = [
    {
      key: "id",
      header: "Transaction ID",
      cell: (t) => <span className="font-mono text-xs">{t.transactionId}</span>,
    },
    {
      key: "client",
      header: "Bank / Patsanstha",
      cell: (t) => (
        <span className="text-sm text-muted-foreground">{t.clientName}</span>
      ),
    },
    { key: "merchant", header: "Merchant", cell: (t) => t.merchantName },
    {
      key: "qr",
      header: "QR Identifier",
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
      key: "vpa",
      header: "Customer VPA",
      cell: (t) => <span className="font-mono text-xs">{t.customerVpa}</span>,
    },
    {
      key: "ref",
      header: "Bank Ref No.",
      cell: (t) => <span className="font-mono text-xs">{t.bankReferenceNumber}</span>,
    },
    { key: "method", header: "Payment Method", cell: (t) => t.paymentMethod },
    {
      key: "date",
      header: "Date & Time",
      cell: (t) => <DateDisplay date={t.initiatedAt} relative />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="View and filter UPI transactions across the platform"
      />

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search transactions..."
          className="sm:w-56"
        />
        <ClientSelector
          clients={clients}
          value={clientFilter === "all" ? undefined : clientFilter}
          onChange={(v) => {
            setClientFilter(v);
            setMerchantFilter("all");
            setQrFilter("all");
          }}
          includeAll
          className="w-48"
        />
        <MerchantSelector
          merchants={merchants}
          value={merchantFilter === "all" ? undefined : merchantFilter}
          onChange={(v) => {
            setMerchantFilter(v);
            setQrFilter("all");
          }}
          clientId={clientFilter !== "all" ? clientFilter : undefined}
          includeAll
          className="w-48"
        />
        <Select value={activeQrFilter} onValueChange={onSelectValue(setQrFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="QR Code" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All QR Codes</SelectItem>
            {filteredQRs.map((qr) => (
              <SelectItem key={qr.id} value={qr.id}>
                {qr.qrIdentifier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <div className="flex items-center gap-2">
          <Label htmlFor="dateFrom" className="sr-only">From</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
          />
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={transactions}
        emptyTitle="No transactions found"
        onRowClick={(t) => {
          setSelectedTxn(t);
          setSheetOpen(true);
        }}
      />

      <TransactionDetailSheet
        transaction={selectedTxn}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}

export function TransactionsPageFallback() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="View and filter UPI transactions across the platform"
      />
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
