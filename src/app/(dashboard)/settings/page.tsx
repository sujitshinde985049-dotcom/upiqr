import { notFound } from "next/navigation";
import {
  canAccessSettings,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { SettingsPageContent } from "./settings-content";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();

  if (!canAccessSettings(user)) {
    notFound();
  }

  return <SettingsPageContent />;
}
