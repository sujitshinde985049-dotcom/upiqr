"use server";

import { requireAuthenticatedUser, canAccessNotifications } from "@/lib/auth/authorization";
import {
  getNotificationsForUser,
  getRecentNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationServiceError,
} from "@/lib/services/notification-service";
import {
  markNotificationReadSchema,
  notificationListQuerySchema,
} from "@/lib/validations/notifications";
import { actionError, actionSuccess, type ActionResult } from "./types";

function mapNotificationError(error: unknown): ActionResult<never> {
  if (error instanceof NotificationServiceError) {
    if (error.code === "FORBIDDEN") {
      return actionError("You do not have permission to perform this action");
    }
    return actionError("Notification not found");
  }
  return actionError("Unable to process notification request");
}

export async function getUnreadNotificationCountAction(): Promise<
  ActionResult<{ count: number }>
> {
  try {
    const user = await requireAuthenticatedUser();
    if (!canAccessNotifications(user)) {
      return actionError("Insufficient permissions");
    }
    const count = await getUnreadNotificationCount(user);
    return actionSuccess({ count });
  } catch (error) {
    return mapNotificationError(error);
  }
}

export async function getRecentNotificationsAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof getRecentNotificationsForUser>>>
> {
  try {
    const user = await requireAuthenticatedUser();
    if (!canAccessNotifications(user)) {
      return actionError("Insufficient permissions");
    }
    const items = await getRecentNotificationsForUser(user);
    return actionSuccess(items);
  } catch (error) {
    return mapNotificationError(error);
  }
}

export async function getNotificationsAction(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof getNotificationsForUser>>>> {
  try {
    const user = await requireAuthenticatedUser();
    if (!canAccessNotifications(user)) {
      return actionError("Insufficient permissions");
    }

    const parsed = notificationListQuerySchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = await getNotificationsForUser(user, parsed.data);
    return actionSuccess(data);
  } catch (error) {
    return mapNotificationError(error);
  }
}

export async function markNotificationReadAction(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof markNotificationRead>>>> {
  try {
    const user = await requireAuthenticatedUser();
    if (!canAccessNotifications(user)) {
      return actionError("Insufficient permissions");
    }

    const parsed = markNotificationReadSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = await markNotificationRead(user, parsed.data.notificationId);
    return actionSuccess(data);
  } catch (error) {
    return mapNotificationError(error);
  }
}

export async function markAllNotificationsReadAction(): Promise<
  ActionResult<{ marked: number }>
> {
  try {
    const user = await requireAuthenticatedUser();
    if (!canAccessNotifications(user)) {
      return actionError("Insufficient permissions");
    }

    const data = await markAllNotificationsRead(user);
    return actionSuccess(data);
  } catch (error) {
    return mapNotificationError(error);
  }
}
