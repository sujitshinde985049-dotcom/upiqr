"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar } from "@/components/shared/FilterBar";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { MerchantSelector } from "@/components/shared/MerchantSelector";
import { Pagination } from "@/components/shared/Pagination";
import {
  buildTransactionListColumns,
  TransactionSummaryCards,
} from "@/components/transactions/transaction-shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onSelectValue } from "@/lib/utils/select";
import type { SessionUser } from "@/lib/auth/types";
import type {
  Client,
  ManagedTransactionListResult,
  Merchant,
  QRCodeWithStats,
} from "@/types";
import type { TransactionManagementQuery } from "@/lib/validations/transactions";

interface TransactionsPageContentProps {
  clients: Client[];
  merchants: Merchant[];
  qrs: QRCodeWithStats[];
  result: ManagedTransactionListResult;
  query: TransactionManagementQuery;
  user: SessionUser;
}

function buildQueryString(
  current: TransactionManagementQuery,
  updates: Partial<TransactionManagementQuery>
): string {
  const next = { ...current, ...updates, page: updates.page ?? 1 };
  const params = new URLSearchParams();

  if (next.search) params.set("search", next.search);
  if (next.status !== "all") params.set("status", next.status);
  if (next.clientId) params.set("client", next.clientId);
  if (next.merchantId) params.set("merchant", next.merchantId);
  if (next.qrId) params.set("qr", next.qrId);
  if (next.providerMode !== "all") params.set("providerMode", next.providerMode);
  if (next.fromDate) params.set("fromDate", next.fromDate);
  if (next.toDate) params.set("toDate", next.toDate);
  if (next.sortBy !== "initiated_at") params.set("sortBy", next.sortBy);
  if (next.sortOrder !== "desc") params.set("sortOrder", next.sortOrder);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.limit !== 20) params.set("limit", String(next.limit));

  const value = params.toString();
  return value ? `?${value}` : "";
}

export function TransactionsPageContent({
  clients,
  merchants,
  qrs,
  result,
  query,
  user,
}: TransactionsPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const navigate = (updates: Partial<TransactionManagementQuery>) => {
    startTransition(() => {
      router.push(`/transactions${buildQueryString(query, updates)}`);
    });
  };

  const filteredQRs = useMemo(() => {
    let filtered = qrs;
    if (query.clientId) {
      filtered = filtered.filter((qr) => qr.clientId === query.clientId);
    }
    if (query.merchantId) {
      filtered = filtered.filter((qr) => qr.merchantId === query.merchantId);
    }
    return filtered;
  }, [qrs, query.clientId, query.merchantId]);

  const columns = buildTransactionListColumns({ user });

  const handleExport = async () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("limit");

    const response = await fetch(`/api/transactions/export?${params.toString()}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      toast.error(body?.error ?? "Export failed");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
      "transactions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Transaction export downloaded");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="View and filter UPI transactions across the platform"
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <TransactionSummaryCards
        summary={result.summary}
        providerModeFilter={query.providerMode}
      />

      <FilterBar>
        <SearchInput
          value={query.search ?? ""}
          onChange={(value) => navigate({ search: value || undefined })}
          placeholder="Search by ID, reference, merchant, QR..."
          className="sm:w-56"
        />
        {user.role !== "MERCHANT_USER" ? (
          <ClientSelector
            clients={clients}
            value={query.clientId}
            onChange={(value) =>
              navigate({
                clientId: value,
                merchantId: undefined,
                qrId: undefined,
              })
            }
            includeAll
            className="w-48"
          />
        ) : null}
        <MerchantSelector
          merchants={merchants}
          value={query.merchantId}
          onChange={(value) =>
            navigate({ merchantId: value, qrId: undefined })
          }
          clientId={query.clientId}
          includeAll
          className="w-48"
        />
        <Select
          value={query.qrId ?? "all"}
          onValueChange={onSelectValue((value) =>
            navigate({ qrId: value === "all" ? undefined : value })
          )}
        >
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
        <Select
          value={query.status}
          onValueChange={onSelectValue((value) =>
            navigate({ status: value as TransactionManagementQuery["status"] })
          )}
        >
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
        <Select
          value={query.providerMode}
          onValueChange={onSelectValue((value) =>
            navigate({
              providerMode: value as TransactionManagementQuery["providerMode"],
            })
          )}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Provider Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="mock">MOCK</SelectItem>
            <SelectItem value="legacy">LEGACY</SelectItem>
            <SelectItem value="live">LIVE</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label htmlFor="dateFrom" className="sr-only">
            From
          </Label>
          <Input
            id="dateFrom"
            type="date"
            value={query.fromDate ?? ""}
            onChange={(event) =>
              navigate({ fromDate: event.target.value || undefined })
            }
            className="w-36"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={query.toDate ?? ""}
            onChange={(event) =>
              navigate({ toDate: event.target.value || undefined })
            }
            className="w-36"
          />
        </div>
        <Select
          value={query.sortBy}
          onValueChange={onSelectValue((value) =>
            navigate({ sortBy: value as TransactionManagementQuery["sortBy"] })
          )}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="initiated_at">Initiated At</SelectItem>
            <SelectItem value="created_at">Created At</SelectItem>
            <SelectItem value="amount">Amount</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={query.sortOrder}
          onValueChange={onSelectValue((value) =>
            navigate({
              sortOrder: value as TransactionManagementQuery["sortOrder"],
            })
          )}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Descending</SelectItem>
            <SelectItem value="asc">Ascending</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={result.items}
        emptyTitle="No transactions found"
        onRowClick={(transaction) => router.push(`/transactions/${transaction.id}`)}
      />

      <Pagination
        page={result.pagination.page}
        totalPages={result.pagination.totalPages}
        total={result.pagination.total}
        pageSize={result.pagination.limit}
        itemLabel="transactions"
        onPageChange={(page) => navigate({ page })}
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
