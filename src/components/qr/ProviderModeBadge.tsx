"use client";

import { Badge } from "@/components/ui/badge";

export function ProviderModeBadge({
  mode,
  isPayable,
}: {
  mode: "mock" | "live" | "legacy";
  isPayable?: boolean;
}) {
  if (mode === "live" && isPayable) {
    return <Badge variant="default">LIVE</Badge>;
  }
  if (mode === "mock") {
    return (
      <Badge variant="secondary" className="border-amber-500/50 text-amber-700">
        TEST
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      LEGACY
    </Badge>
  );
}
