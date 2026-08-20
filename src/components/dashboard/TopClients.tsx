import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ClientWithStats } from "@/types";
import { Building2 } from "lucide-react";

interface TopClientsProps {
  clients: ClientWithStats[];
}

export function TopClients({ clients }: TopClientsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Top Performing Clients
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {clients.map((client, index) => (
          <Link
            key={client.id}
            href={`/clients/${client.id}`}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{client.name}</p>
              <p className="text-xs text-muted-foreground">
                {client.totalMerchants} merchants · {client.activeQr} QRs
              </p>
            </div>
            <div className="text-right">
              <CurrencyDisplay amount={client.totalCollection} className="text-sm" />
              <StatusBadge status={client.status} className="mt-1" />
            </div>
          </Link>
        ))}
        {clients.length === 0 && (
          <div className="flex flex-col items-center py-6 text-muted-foreground">
            <Building2 className="mb-2 h-8 w-8" />
            <p className="text-sm">No client data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
