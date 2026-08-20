"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { ClientSelector } from "@/components/shared/ClientSelector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onSelectValue } from "@/lib/utils/select";
import { updateUserStatusAction } from "@/lib/actions/user-actions";
import type { PaginatedUsersResult } from "@/lib/services/user-service";
import type { UserListQuery } from "@/lib/validations/users";
import type { Client, User, UserRole } from "@/types";

const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  client_admin: "Client Admin",
  client_operator: "Client Operator",
  merchant_user: "Merchant User",
};

interface UsersPageContentProps {
  result: PaginatedUsersResult;
  query: UserListQuery;
  clientNameMap: Record<string, string>;
  clients: Client[];
  isSuperAdmin: boolean;
}

function buildQueryString(query: UserListQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== 10) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.role !== "all") params.set("role", query.role);
  if (query.status !== "all") params.set("status", query.status);
  if (query.clientId) params.set("clientId", query.clientId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function UsersPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function UsersPageContent({
  result,
  query,
  clientNameMap,
  clients,
  isSuperAdmin,
}: UsersPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(query.search ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const navigate = useCallback(
    (updates: Partial<UserListQuery>) => {
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

  const columns: Column<User>[] = [
    { key: "name", header: "Name", cell: (u) => <span className="font-medium">{u.name}</span> },
    { key: "email", header: "Email", cell: (u) => u.email },
    {
      key: "role",
      header: "Role",
      cell: (u) => <Badge variant="outline">{roleLabels[u.role]}</Badge>,
    },
    {
      key: "client",
      header: "Bank / Patsanstha",
      cell: (u) => {
        if (!u.clientId) return <span className="text-muted-foreground">—</span>;
        return clientNameMap[u.clientId] ?? u.clientId;
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => <StatusBadge status={u.status} />,
    },
    {
      key: "lastLogin",
      header: "Last Login",
      cell: (u) =>
        u.lastLogin ? (
          <DateDisplay date={u.lastLogin} />
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (u) => (
        <div className="flex items-center gap-1">
          {u.role !== "super_admin" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setSelectedUser(u);
                setConfirmOpen(true);
              }}
            >
              <Power className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        description="Manage platform users and role assignments"
        actions={
          <Button asChild>
            <Link href="/users/new">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Link>
          </Button>
        }
      />

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search users..."
          className="sm:w-64"
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
          value={query.role}
          onValueChange={onSelectValue((v) =>
            navigate({ role: v as UserListQuery["role"], page: 1 })
          )}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="client_admin">Client Admin</SelectItem>
            <SelectItem value="client_operator">Client Operator</SelectItem>
            <SelectItem value="merchant_user">Merchant User</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={query.status}
          onValueChange={onSelectValue((v) =>
            navigate({ status: v as UserListQuery["status"], page: 1 })
          )}
        >
          <SelectTrigger className="w-36">
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
        emptyTitle="No users found"
        emptyDescription="Try adjusting your search or filters"
      />

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
        itemLabel="users"
        onPageChange={(page) => navigate({ page })}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          selectedUser?.status === "active" ? "Deactivate User" : "Activate User"
        }
        description={`Are you sure you want to ${
          selectedUser?.status === "active" ? "deactivate" : "activate"
        } ${selectedUser?.name}?`}
        confirmLabel={
          selectedUser?.status === "active" ? "Deactivate" : "Activate"
        }
        destructive={selectedUser?.status === "active"}
        onConfirm={async () => {
          if (!selectedUser) return;
          const newStatus =
            selectedUser.status === "active" ? "inactive" : "active";
          const statusResult = await updateUserStatusAction({
            userId: selectedUser.id,
            status: newStatus,
          });
          if (!statusResult.success) {
            toast.error(statusResult.error);
            return;
          }
          toast.success(
            `User ${newStatus === "active" ? "activated" : "deactivated"} successfully`
          );
          setConfirmOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
