import { formatDateTime, formatRelativeDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils";

interface DateDisplayProps {
  date: string;
  relative?: boolean;
  className?: string;
}

export function DateDisplay({ date, relative = false, className }: DateDisplayProps) {
  return (
    <span className={cn("text-sm", className)}>
      {relative ? formatRelativeDate(date) : formatDateTime(date)}
    </span>
  );
}
