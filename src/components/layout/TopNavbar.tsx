"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { NotificationView } from "@/lib/services/notification-service";

interface TopNavbarProps {
  unreadNotificationCount?: number;
  recentNotifications?: NotificationView[];
  showNotifications?: boolean;
}

export function TopNavbar({
  unreadNotificationCount = 0,
  recentNotifications = [],
  showNotifications = false,
}: TopNavbarProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() ?? "SA";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <SidebarTrigger className="md:hidden">
        <Menu className="h-5 w-5" />
      </SidebarTrigger>
      <SidebarTrigger className="hidden md:flex" />

      <div className="flex-1" />

      {showNotifications && (
        <NotificationBell
          unreadCount={unreadNotificationCount}
          recentNotifications={recentNotifications}
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="relative h-9 gap-2 px-2" />
          }
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline-block">
            {user?.name ?? "User"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{user?.name ?? "User"}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user?.email ?? ""}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/profile" className="flex w-full items-center" />}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
