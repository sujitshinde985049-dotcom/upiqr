import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";

export function formatDateTime(dateString: string): string {
  const date = parseISO(dateString);
  return format(date, "dd MMM yyyy, hh:mm a");
}

export function formatDate(dateString: string): string {
  const date = parseISO(dateString);
  return format(date, "dd MMM yyyy");
}

export function formatRelativeDate(dateString: string): string {
  const date = parseISO(dateString);
  if (isToday(date)) return `Today, ${format(date, "hh:mm a")}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, "hh:mm a")}`;
  return formatDateTime(dateString);
}

export function formatTimeAgo(dateString: string): string {
  return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
}
