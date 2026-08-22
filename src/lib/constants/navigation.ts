import {
  LayoutDashboard,
  Building2,
  Store,
  QrCode,
  ArrowLeftRight,
  BarChart3,
  Users,
  Settings,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; href: string }[];
}

/** Client-safe nav filter — mirrors server authorization rules in authorization.ts */
function canAccessNavItem(role: UserRole, href: string): boolean {
  switch (href) {
    case "/clients":
      return (
        role === "SUPER_ADMIN" ||
        role === "CLIENT_ADMIN" ||
        role === "CLIENT_OPERATOR"
      );
    case "/merchants":
      return role !== "MERCHANT_USER";
    case "/reports":
      return true;
    case "/users":
      return role === "SUPER_ADMIN" || role === "CLIENT_ADMIN";
    case "/settings":
      return role === "SUPER_ADMIN" || role === "CLIENT_ADMIN";
    default:
      return true;
  }
}

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return mainNavItems.filter((item) => canAccessNavItem(role, item.href));
}

export const mainNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Clients",
    href: "/clients",
    icon: Building2,
    children: [{ title: "Banks / Patsansthas", href: "/clients" }],
  },
  {
    title: "Merchants",
    href: "/merchants",
    icon: Store,
  },
  {
    title: "QR Management",
    href: "/qr-codes",
    icon: QrCode,
  },
  {
    title: "Transactions",
    href: "/transactions",
    icon: ArrowLeftRight,
  },
  {
    title: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    title: "Users & Roles",
    href: "/users",
    icon: Users,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];
