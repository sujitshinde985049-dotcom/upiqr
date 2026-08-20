"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Eye, Pencil, Power } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { EditClientDialog } from "@/components/clients/EditClientDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { onSelectValue } from "@/lib/utils/select";
import { updateClientStatusAction } from "@/lib/actions/client-actions";
import type { PaginatedClientsResult } from "@/lib/services/client-service";
import type { ClientListQuery } from "@/lib/validations/clients";
import type { ClientWithStats } from "@/types";

interface ClientsPageContentProps {
  result: PaginatedClientsResult;
  query: ClientListQuery;
  canAddClient: boolean;
}

function buildQueryString(query: ClientListQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== 10) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.type !== "all") params.set("type", query.type);
  if (query.status !== "all") params.set("status", query.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function ClientsPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function ClientsPageContent({
  result,
  query,
  canAddClient,
}: ClientsPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(query.search ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithStats | null>(null);

  const navigate = useCallback(
    (updates: Partial<ClientListQuery>) => {
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

  const handleToggleStatus = (client: ClientWithStats) => {
    setSelectedClient(client);
    setConfirmOpen(true);
  };

  const handleEdit = (client: ClientWithStats) => {
    setSelectedClient(client);
    setEditOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!selectedClient) return;

    const action =
      selectedClient.status === "active" ? "deactivate" : "activate";

    const result = await updateClientStatusAction({
      clientId: selectedClient.id,
      action,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(
      action === "activate" ? "Client activated" : "Client deactivated",
      { description: selectedClient.name }
    );
    setConfirmOpen(false);
    setSelectedClient(null);
    router.refresh();
  };

  const columns: Column<ClientWithStats>[] = [
    {
      key: "clientCode",
      header: "Client Code",
      cell: (c) => <span className="font-mono text-xs">{c.clientCode}</span>,
    },
    {
      key: "name",
      header: "Institution Name",
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      key: "type",
      header: "Type",
      cell: (c) => (
        <Badge variant="outline" className="capitalize">
          {c.type}
        </Badge>
      ),
    },
    { key: "contact", header: "Contact Person", cell: (c) => c.contactPerson },
    { key: "mobile", header: "Mobile", cell: (c) => c.mobile },
    {
      key: "merchants",
      header: "Total Merchants",
      cell: (c) => c.totalMerchants,
    },
    { key: "qr", header: "Active QR", cell: (c) => c.activeQr },
    {
      key: "today",
      header: "Today's Collection",
      cell: (c) => <CurrencyDisplay amount={c.todayCollection} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/clients/${c.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleEdit(c)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleToggleStatus(c)}
          >
            <Power className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const isActivating = selectedClient?.status !== "active";
  const confirmTitle = isActivating ? "Activate Client" : "Deactivate Client";
  const confirmDescription = isActivating
    ? `Activate ${selectedClient?.name}? The institution will be able to operate on the platform.`
    : `Deactivate ${selectedClient?.name}? The institution will no longer be active on the platform.`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banks / Patsansthas"
        description="Manage client institutions on the MahaCred platform"
        actions={
          canAddClient ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, code, contact, registration..."
          className="sm:w-72"
        />
        <Select
          value={query.type}
          onValueChange={onSelectValue((v) =>
            navigate({ type: v as ClientListQuery["type"], page: 1 })
          )}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bank">Bank</SelectItem>
            <SelectItem value="patsanstha">Patsanstha</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={query.status}
          onValueChange={onSelectValue((v) =>
            navigate({ status: v as ClientListQuery["status"], page: 1 })
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
      </FilterBar>

      <DataTable
        columns={columns}
        data={result.items}
        emptyTitle="No clients found"
        emptyDescription="Try adjusting your search or filters"
      />

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
        itemLabel="clients"
        onPageChange={(page) => navigate({ page })}
      />

      {canAddClient && <AddClientDialog open={addOpen} onOpenChange={setAddOpen} />}

      <EditClientDialog
        client={selectedClient}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={isActivating ? "Activate" : "Deactivate"}
        destructive={!isActivating}
        onConfirm={confirmStatusChange}
      />
    </div>
  );
}
