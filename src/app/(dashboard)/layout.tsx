import { requireAuthenticatedUser, canAccessNotifications } from "@/lib/auth/authorization";
import {
  getRecentNotificationsForUser,
  getUnreadNotificationCount,
} from "@/lib/services/notification-service";
import { AppShell } from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuthenticatedUser();
  const showNotifications = canAccessNotifications(user);

  const [unreadCount, recentNotifications] = showNotifications
    ? await Promise.all([
        getUnreadNotificationCount(user),
        getRecentNotificationsForUser(user),
      ])
    : [0, []];

  return (
    <AppShell
      unreadNotificationCount={unreadCount}
      recentNotifications={recentNotifications}
      showNotifications={showNotifications}
    >
      {children}
    </AppShell>
  );
}
