import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { MerchantWithStats } from "@/types";
import { Store } from "lucide-react";

interface RecentMerchantsProps {
  merchants: MerchantWithStats[];
}

export function RecentMerchants({ merchants }: RecentMerchantsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recent Merchants</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {merchants.map((merchant) => (
          <Link
            key={merchant.id}
            href={`/merchants/${merchant.id}`}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Store className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">
                {merchant.businessName}
              </p>
              <p className="text-xs text-muted-foreground">
                {merchant.clientName}
              </p>
            </div>
            <div className="text-right">
              <CurrencyDisplay
                amount={merchant.todayCollection}
                className="text-sm"
              />
              <StatusBadge status={merchant.status} className="mt-1" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
