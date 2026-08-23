"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";
import { BreadcrumbsNav } from "@/components/layout/BreadcrumbsNav";
import type { NotificationView } from "@/lib/services/notification-service";

interface AppShellProps {
  children: React.ReactNode;
  unreadNotificationCount?: number;
  recentNotifications?: NotificationView[];
  showNotifications?: boolean;
}

export function AppShell({
  children,
  unreadNotificationCount = 0,
  recentNotifications = [],
  showNotifications = false,
}: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopNavbar
          unreadNotificationCount={unreadNotificationCount}
          recentNotifications={recentNotifications}
          showNotifications={showNotifications}
        />
        <main className="flex-1 p-4 lg:p-6">
          <BreadcrumbsNav />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
