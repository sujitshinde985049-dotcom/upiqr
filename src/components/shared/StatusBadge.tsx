import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EntityStatus, TransactionStatus } from "@/types";

type StatusType = EntityStatus | TransactionStatus;

const statusConfig: Record<
  StatusType,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  inactive: { label: "Inactive", variant: "secondary" },
  pending: { label: "Pending", variant: "outline" },
  success: { label: "Success", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge
      variant={config.variant}
      className={cn(
        status === "success" && "bg-emerald-600 hover:bg-emerald-600",
        status === "active" && "bg-emerald-600 hover:bg-emerald-600",
        status === "pending" && "border-amber-500 text-amber-700",
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
