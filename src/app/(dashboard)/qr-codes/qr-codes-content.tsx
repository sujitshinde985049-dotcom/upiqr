"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Eye, Download, ArrowLeftRight, Power } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { GenerateQRDialog } from "@/components/qr/GenerateQRDialog";
import { ProviderModeBadge } from "@/components/qr/ProviderModeBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { onSelectValue } from "@/lib/utils/select";
import { updateQRStatusAction } from "@/lib/actions/qr-actions";
import type { Client, Merchant, QRCodeWithStats } from "@/types";

interface QRCodesPageContentProps {
  initialQRCodes: QRCodeWithStats[];
  clients: Client[];
  merchants: Merchant[];
}

export function QRCodesPageContent({
  initialQRCodes,
  clients,
  merchants,
}: QRCodesPageContentProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [railFilter, setRailFilter] = useState("all");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedQR, setSelectedQR] = useState<QRCodeWithStats | null>(null);

  const qrCodes = useMemo(() => {
    let data = initialQRCodes;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (qr) =>
          qr.qrName.toLowerCase().includes(q) ||
          qr.qrIdentifier.toLowerCase().includes(q) ||
          qr.merchantName.toLowerCase().includes(q) ||
          qr.id.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      data = data.filter((qr) => qr.status === statusFilter);
    }
    if (railFilter !== "all") {
      data = data.filter((qr) => qr.railId === railFilter);
    }
    return data;
  }, [initialQRCodes, search, statusFilter, railFilter]);

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
            onClick={() =>
              toast.info("Download started (Demo)", { description: qr.qrName })
            }
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/transactions?qr=${qr.id}`}>
              <ArrowLeftRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setSelectedQR(qr);
              setConfirmOpen(true);
            }}
          >
            <Power className="h-4 w-4" />
          </Button>
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
        SabPaisa contract mock mode is active. New QR records are TEST only and are
        not payable. No live SabPaisa network request is made.
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search QR codes..."
          className="sm:w-64"
        />
        <Select value={statusFilter} onValueChange={onSelectValue(setStatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={railFilter} onValueChange={onSelectValue(setRailFilter)}>
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

      <DataTable columns={columns} data={qrCodes} emptyTitle="No QR codes found" />

      <GenerateQRDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        merchants={merchants}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Deactivate QR Code"
        description={`Are you sure you want to deactivate "${selectedQR?.qrName}"? This action can be reversed later.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          if (!selectedQR) return;
          const result = await updateQRStatusAction(selectedQR.id, "inactive");
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("QR code deactivated", {
            description: selectedQR.qrName,
          });
          setConfirmOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
