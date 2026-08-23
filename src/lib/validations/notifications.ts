import { z } from "zod";

export const NOTIFICATION_PAGE_SIZE_DEFAULT = 20;
export const NOTIFICATION_PAGE_SIZE_MAX = 50;
export const NOTIFICATION_RECENT_LIMIT = 10;

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_PAGE_SIZE_MAX)
    .default(NOTIFICATION_PAGE_SIZE_DEFAULT),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.string().min(1, "Notification ID is required"),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
