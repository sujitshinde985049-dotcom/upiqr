"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";
import { BreadcrumbsNav } from "@/components/layout/BreadcrumbsNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopNavbar />
        <main className="flex-1 p-4 lg:p-6">
          <BreadcrumbsNav />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
