import { cn } from "@/lib/utils";

interface CurrencyDisplayProps {
  amount: number;
  className?: string;
  showSymbol?: boolean;
}

export function CurrencyDisplay({
  amount,
  className,
  showSymbol = true,
}: CurrencyDisplayProps) {
  const formatted = new Intl.NumberFormat("en-IN", {
    style: showSymbol ? "currency" : "decimal",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return <span className={cn("font-medium tabular-nums", className)}>{formatted}</span>;
}
