"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Eye, Pencil, Power, QrCode } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { GenerateQRDialog } from "@/components/qr/GenerateQRDialog";
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
import { updateMerchantStatusAction } from "@/lib/actions/merchant-actions";
import type { PaginatedMerchantsResult } from "@/lib/services/merchant-service";
import type { MerchantListQuery } from "@/lib/validations/merchants";
import type { Client, MerchantWithStats } from "@/types";

interface MerchantsPageContentProps {
  result: PaginatedMerchantsResult;
  query: MerchantListQuery;
  clients: Client[];
  canCreateMerchant: boolean;
  canEditMerchant: boolean;
  isSuperAdmin: boolean;
}

function buildQueryString(query: MerchantListQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== 10) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.status !== "all") params.set("status", query.status);
  if (query.clientId) params.set("clientId", query.clientId);
  if (query.category) params.set("category", query.category);
  if (query.sort !== "newest") params.set("sort", query.sort);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function MerchantsPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function MerchantsPageContent({
  result,
  query,
  clients,
  canCreateMerchant,
  canEditMerchant,
  isSuperAdmin,
}: MerchantsPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(query.search ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantWithStats | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrMerchantId, setQrMerchantId] = useState<string>();

  const navigate = useCallback(
    (updates: Partial<MerchantListQuery>) => {
      const next = { ...query, ...updates };
      startTransition(() => {
        router.push(`${pathname}${buildQueryString(next)}`);
      });
    },
    [pathname, query, router]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = search.trim();
      if (trimmed === (query.search ?? "")) return;
      navigate({ search: trimmed || undefined, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query.search, navigate]);

  const handleStatusToggle = (merchant: MerchantWithStats) => {
    setSelectedMerchant(merchant);
    setConfirmOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!selectedMerchant) return;

    const action =
      selectedMerchant.status === "active" ? "deactivate" : "activate";

    const statusResult = await updateMerchantStatusAction({
      merchantId: selectedMerchant.id,
      action,
    });

    if (!statusResult.success) {
      toast.error(statusResult.error);
      return;
    }

    toast.success(
      action === "activate" ? "Merchant activated" : "Merchant deactivated",
      { description: selectedMerchant.businessName }
    );
    setConfirmOpen(false);
    setSelectedMerchant(null);
    router.refresh();
  };

  const columns: Column<MerchantWithStats>[] = [
    {
      key: "merchantCode",
      header: "Merchant Code",
      cell: (m) => <span className="font-mono text-xs">{m.merchantCode}</span>,
    },
    {
      key: "business",
      header: "Business Name",
      cell: (m) => <span className="font-medium">{m.businessName}</span>,
    },
    { key: "holder", header: "Account Holder", cell: (m) => m.accountHolderName },
    ...(isSuperAdmin
      ? [
          {
            key: "client",
            header: "Bank / Patsanstha",
            cell: (m: MerchantWithStats) => (
              <span className="text-sm text-muted-foreground">{m.clientName}</span>
            ),
          } as Column<MerchantWithStats>,
        ]
      : []),
    {
      key: "account",
      header: "Current Account",
      cell: (m) => (
        <span className="font-mono text-xs">
          {m.maskedCurrentAccountReference}
        </span>
      ),
    },
    { key: "mobile", header: "Mobile", cell: (m) => m.mobile },
    { key: "qr", header: "Active QR", cell: (m) => m.qrCount },
    {
      key: "today",
      header: "Today's Collection",
      cell: (m) => <CurrencyDisplay amount={m.todayCollection} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (m) => <StatusBadge status={m.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (m) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/merchants/${m.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          {canEditMerchant && (
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/merchants/${m.id}/edit`}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {canEditMerchant && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleStatusToggle(m)}
            >
              <Power className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setQrMerchantId(m.id);
              setQrOpen(true);
            }}
          >
            <QrCode className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const isActivating = selectedMerchant?.status !== "active";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Merchants"
        description="Current account holders of Banks and Patsansthas"
        actions={
          canCreateMerchant ? (
            <Button asChild>
              <Link href="/merchants/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Merchant
              </Link>
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code, name, mobile, PAN, GST..."
          className="sm:w-72"
        />
        {isSuperAdmin && (
          <ClientSelector
            clients={clients}
            value={query.clientId}
            onChange={(v) => navigate({ clientId: v || undefined, page: 1 })}
            includeAll
            className="w-56"
          />
        )}
        <Select
          value={query.status}
          onValueChange={onSelectValue((v) =>
            navigate({ status: v as MerchantListQuery["status"], page: 1 })
          )}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        {result.categories.length > 0 && (
          <Select
            value={query.category ?? "all"}
            onValueChange={onSelectValue((v) =>
              navigate({
                category: v === "all" ? undefined : v,
                page: 1,
              })
            )}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {result.categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={query.sort}
          onValueChange={onSelectValue((v) =>
            navigate({ sort: v as MerchantListQuery["sort"], page: 1 })
          )}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="name_desc">Name Z–A</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={result.items}
        emptyTitle="No merchants found"
        emptyDescription="Try adjusting your search or filters"
      />

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
        itemLabel="merchants"
        onPageChange={(page) => navigate({ page })}
      />

      <GenerateQRDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        merchants={result.items}
        defaultMerchantId={qrMerchantId}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isActivating ? "Activate Merchant" : "Deactivate Merchant"}
        description={
          isActivating
            ? `Activate ${selectedMerchant?.businessName}? The merchant will be able to operate on the platform.`
            : `Deactivate ${selectedMerchant?.businessName}? The merchant will no longer be active.`
        }
        confirmLabel={isActivating ? "Activate" : "Deactivate"}
        destructive={!isActivating}
        onConfirm={confirmStatusChange}
      />
    </div>
  );
}
