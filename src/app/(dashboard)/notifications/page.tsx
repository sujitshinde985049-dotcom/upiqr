import { notFound } from "next/navigation";
import {
  canAccessNotifications,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { getNotificationsForUser } from "@/lib/services/notification-service";
import { notificationListQuerySchema } from "@/lib/validations/notifications";
import { NotificationsPageContent } from "./notifications-content";

interface NotificationsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const user = await requireAuthenticatedUser();

  if (!canAccessNotifications(user)) {
    notFound();
  }

  const params = await searchParams;
  const query = notificationListQuerySchema.parse({
    page: params.page ?? 1,
  });
  const data = await getNotificationsForUser(user, query);

  return <NotificationsPageContent data={data} />;
}
