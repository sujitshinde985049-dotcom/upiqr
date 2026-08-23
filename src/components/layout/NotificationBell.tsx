"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notification-actions";
import type { NotificationView } from "@/lib/services/notification-service";

interface NotificationBellProps {
  unreadCount: number;
  recentNotifications: NotificationView[];
}

function severityVariant(
  severity: NotificationView["severity"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "ERROR":
      return "destructive";
    case "WARNING":
      return "outline";
    case "SUCCESS":
      return "default";
    default:
      return "secondary";
  }
}

function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NotificationBell({
  unreadCount,
  recentNotifications,
}: NotificationBellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(recentNotifications);
  const [count, setCount] = useState(unreadCount);

  const handleMarkRead = async (notificationId: string, linkPath?: string | null) => {
    const result = await markNotificationReadAction({ notificationId });
    if (!result.success) return;

    setItems((current) =>
      current.map((item) =>
        item.id === notificationId
          ? { ...item, isRead: true, readAt: new Date() }
          : item
      )
    );
    setCount((current) => Math.max(0, current - 1));

    if (linkPath) {
      startTransition(() => {
        router.push(linkPath);
      });
    } else {
      startTransition(() => router.refresh());
    }
  };

  const handleMarkAllRead = async () => {
    const result = await markAllNotificationsReadAction();
    if (!result.success) return;

    setItems((current) =>
      current.map((item) => ({ ...item, isRead: true, readAt: new Date() }))
    );
    setCount(0);
    startTransition(() => router.refresh());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative" />}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleMarkAllRead}
              disabled={isPending}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No operational notifications yet.
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="flex cursor-pointer flex-col items-start gap-1 whitespace-normal p-3"
              onClick={() => void handleMarkRead(item.id, item.linkPath)}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium">{item.title}</span>
                <Badge variant={severityVariant(item.severity)} className="shrink-0">
                  {item.type.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{item.message}</p>
              <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground">
                <span>{formatTimestamp(item.createdAt)}</span>
                {!item.isRead && <span className="font-medium text-primary">Unread</span>}
              </div>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/notifications" className="w-full text-center text-sm" />}
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
