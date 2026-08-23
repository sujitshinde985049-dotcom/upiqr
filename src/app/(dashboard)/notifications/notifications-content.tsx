"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notification-actions";
import type { NotificationListResult } from "@/lib/services/notification-service";

interface NotificationsPageContentProps {
  data: NotificationListResult;
}

function severityVariant(
  severity: NotificationListResult["items"][number]["severity"]
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

export function NotificationsPageContent({ data }: NotificationsPageContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleMarkRead = async (notificationId: string) => {
    const result = await markNotificationReadAction({ notificationId });
    if (!result.success) return;
    startTransition(() => router.refresh());
  };

  const handleMarkAllRead = async () => {
    const result = await markAllNotificationsReadAction();
    if (!result.success) return;
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Operational awareness only. Notifications do not determine payment status."
        actions={
          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={isPending || data.items.every((item) => item.isRead)}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        }
      />

      <Card>
        <CardContent className="divide-y p-0">
          {data.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No operational notifications in your authorized scope.
            </div>
          ) : (
            data.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{item.title}</h3>
                    <Badge variant={severityVariant(item.severity)}>
                      {item.type.replaceAll("_", " ")}
                    </Badge>
                    {!item.isRead && (
                      <Badge variant="outline" className="text-primary">
                        Unread
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(item.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.linkPath && (
                    <Link href={item.linkPath}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  )}
                  {!item.isRead && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleMarkRead(item.id)}
                      disabled={isPending}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
