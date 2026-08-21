"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  Eye,
  Download,
  ArrowLeftRight,
  Power,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { GenerateQRDialog } from "@/components/qr/GenerateQRDialog";
import { EditQRDialog } from "@/components/qr/EditQRDialog";
import { ProviderModeBadge } from "@/components/qr/ProviderModeBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { onSelectValue } from "@/lib/utils/select";
import {
  deactivateQRAction,
  reactivateQRAction,
} from "@/lib/actions/qr-actions";
import type { PaginatedQRCodesResult } from "@/lib/services/qr-service";
import type { QRListQuery } from "@/lib/validations/qr";
import type { Client, Merchant, QRCodeWithStats } from "@/types";

interface QRCodesPageContentProps {
  result: PaginatedQRCodesResult;
  query: QRListQuery;
  clients: Client[];
  merchants: Merchant[];
}

function buildQueryString(query: QRListQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.limit !== 20) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.status !== "all") params.set("status", query.status);
  if (query.railId !== "all") params.set("railId", query.railId);
  if (query.category) params.set("category", query.category);
  if (query.sortBy !== "created_at") params.set("sortBy", query.sortBy);
  if (query.sortOrder !== "desc") params.set("sortOrder", query.sortOrder);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function QRCodesPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function QRCodesPageContent({
  result,
  query,
  merchants,
}: QRCodesPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(query.search ?? "");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [selectedQR, setSelectedQR] = useState<QRCodeWithStats | null>(null);

  const navigate = useCallback(
    (next: QRListQuery) => {
      startTransition(() => {
        router.push(`${pathname}${buildQueryString(next)}`);
      });
    },
    [pathname, router]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((query.search ?? "") !== search) {
        navigate({ ...query, page: 1, search: search || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query, navigate]);

  const columns: Column<QRCodeWithStats>[] = [
    {
      key: "id",
      header: "QR ID",
      cell: (qr) => <span className="font-mono text-xs">{qr.id}</span>,
    },
    { key: "merchant", header: "Merchant", cell: (qr) => qr.merchantName },
    {
      key: "client",
      header: "Bank / Patsanstha",
      cell: (qr) => (
        <span className="text-sm text-muted-foreground">{qr.clientName}</span>
      ),
    },
    { key: "name", header: "QR Name", cell: (qr) => qr.qrName },
    {
      key: "identifier",
      header: "QR Identifier",
      cell: (qr) => <span className="font-mono text-xs">{qr.qrIdentifier}</span>,
    },
    { key: "rail", header: "Rail", cell: (qr) => qr.railId },
    {
      key: "mode",
      header: "Mode",
      cell: (qr) => (
        <ProviderModeBadge mode={qr.providerMode} isPayable={qr.isPayable} />
      ),
    },
    { key: "txns", header: "Transactions", cell: (qr) => qr.transactionCount },
    {
      key: "collection",
      header: "Collection",
      cell: (qr) => <CurrencyDisplay amount={qr.collection} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (qr) => <StatusBadge status={qr.status} />,
    },
    {
      key: "created",
      header: "Created At",
      cell: (qr) => <DateDisplay date={qr.createdAt} />,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (qr) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/qr-codes/${qr.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setSelectedQR(qr);
              setEditOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a href={`/api/qr/${qr.id}/download?format=png&size=512`} download>
              <Download className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/transactions?qr=${qr.id}`}>
              <ArrowLeftRight className="h-4 w-4" />
            </Link>
          </Button>
          {qr.status === "active" ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setSelectedQR(qr);
                setDeactivateOpen(true);
              }}
            >
              <Power className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setSelectedQR(qr);
                setReactivateOpen(true);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR Management"
        description="Manage QR codes across all merchants and clients"
        actions={
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Generate QR
          </Button>
        }
      />

      <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 p-4 text-sm text-amber-900">
        SabPaisa contract mock mode is active. QR records are TEST only and are not
        payable. No live SabPaisa network request is made.
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search QR codes..."
          className="sm:w-64"
        />
        <Select
          value={query.status}
          onValueChange={onSelectValue((value) =>
            navigate({ ...query, page: 1, status: value as QRListQuery["status"] })
          )}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={query.railId}
          onValueChange={onSelectValue((value) =>
            navigate({ ...query, page: 1, railId: value as QRListQuery["railId"] })
          )}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Rail" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rails</SelectItem>
            <SelectItem value="HDFC">HDFC</SelectItem>
            <SelectItem value="ICICI">ICICI</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={result.items}
        emptyTitle="No QR codes found"
      />

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        pageSize={result.limit}
        total={result.total}
        itemLabel="QR codes"
        onPageChange={(page) => navigate({ ...query, page })}
      />

      <GenerateQRDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        merchants={merchants}
      />

      <EditQRDialog qr={selectedQR} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate this QR?"
        description={`Are you sure you want to deactivate "${selectedQR?.qrName}"? This is a soft deactivate and can be reversed later.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          if (!selectedQR) return;
          const resultAction = await deactivateQRAction(selectedQR.id);
          if (!resultAction.success) {
            toast.error(resultAction.error);
            return;
          }
          toast.success("QR code deactivated", { description: selectedQR.qrName });
          setDeactivateOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title="Reactivate this QR?"
        description={`Reactivate "${selectedQR?.qrName}"? This will restore active status without creating a new QR record.`}
        confirmLabel="Reactivate"
        onConfirm={async () => {
          if (!selectedQR) return;
          const resultAction = await reactivateQRAction(selectedQR.id);
          if (!resultAction.success) {
            toast.error(resultAction.error);
            return;
          }
          toast.success("QR code reactivated", { description: selectedQR.qrName });
          setReactivateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
