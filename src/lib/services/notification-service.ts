import {
  NotificationSeverity,
  NotificationType,
  Prisma,
  QRProviderMode,
  TransactionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isSuperAdmin, type SessionUser } from "@/lib/auth/types";
import { decimalToNumber } from "@/lib/mappers";
import { formatCurrency } from "@/lib/utils/format-currency";
import {
  NOTIFICATION_PAGE_SIZE_DEFAULT,
  NOTIFICATION_RECENT_LIMIT,
  type NotificationListQuery,
} from "@/lib/validations/notifications";

export const NOTIFICATION_SOURCE_TYPES = {
  PAYMENT_EVENT: "PaymentEvent",
  QR_CODE: "QRCode",
  MERCHANT: "Merchant",
  CLIENT: "Client",
} as const;

export type NotificationView = {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  clientId: string | null;
  merchantId: string | null;
  transactionId: string | null;
  qrId: string | null;
  providerMode: QRProviderMode | null;
  linkPath: string | null;
  createdAt: Date;
  isRead: boolean;
  readAt: Date | null;
};

export type NotificationListResult = {
  items: NotificationView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export class NotificationServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "NOT_FOUND"
  ) {
    super(message);
    this.name = "NotificationServiceError";
  }
}

export type CreateOperationalNotificationInput = {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  clientId?: string | null;
  merchantId?: string | null;
  transactionId?: string | null;
  qrId?: string | null;
  providerMode?: QRProviderMode | null;
  sourceType: string;
  sourceId: string;
  linkPath?: string | null;
};

function providerModeLabel(mode: QRProviderMode | null | undefined): string {
  if (mode === QRProviderMode.MOCK) return "TEST";
  if (mode === QRProviderMode.LEGACY) return "LEGACY";
  if (mode === QRProviderMode.LIVE) return "LIVE";
  return "";
}

function withProviderContext(
  title: string,
  providerMode: QRProviderMode | null | undefined
): string {
  const label = providerModeLabel(providerMode);
  if (label === "TEST") return `TEST: ${title}`;
  if (label === "LEGACY") return `LEGACY: ${title}`;
  return title;
}

export function buildNotificationVisibilityWhere(
  user: SessionUser
): Prisma.NotificationWhereInput {
  if (isSuperAdmin(user)) {
    return {};
  }

  if (user.role === "MERCHANT_USER") {
    if (!user.clientId || !user.merchantId) {
      throw new NotificationServiceError("Merchant context required", "FORBIDDEN");
    }
    return {
      clientId: user.clientId,
      merchantId: user.merchantId,
    };
  }

  if (user.role === "CLIENT_ADMIN" || user.role === "CLIENT_OPERATOR") {
    if (!user.clientId) {
      throw new NotificationServiceError("Client context required", "FORBIDDEN");
    }
    return { clientId: user.clientId };
  }

  throw new NotificationServiceError("Insufficient permissions", "FORBIDDEN");
}

function mapNotificationRow(
  row: {
    id: string;
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    message: string;
    clientId: string | null;
    merchantId: string | null;
    transactionId: string | null;
    qrId: string | null;
    providerMode: QRProviderMode | null;
    linkPath: string | null;
    createdAt: Date;
    reads: { readAt: Date }[];
  }
): NotificationView {
  const read = row.reads[0];
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    clientId: row.clientId,
    merchantId: row.merchantId,
    transactionId: row.transactionId,
    qrId: row.qrId,
    providerMode: row.providerMode,
    linkPath: row.linkPath,
    createdAt: row.createdAt,
    isRead: Boolean(read),
    readAt: read?.readAt ?? null,
  };
}

export async function createOperationalNotification(
  input: CreateOperationalNotificationInput
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.notification.findUnique({
    where: {
      sourceType_sourceId_type: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        type: input.type,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, created: false };
  }

  try {
    const created = await prisma.notification.create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        clientId: input.clientId ?? null,
        merchantId: input.merchantId ?? null,
        transactionId: input.transactionId ?? null,
        qrId: input.qrId ?? null,
        providerMode: input.providerMode ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        linkPath: input.linkPath ?? null,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await prisma.notification.findUnique({
        where: {
          sourceType_sourceId_type: {
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            type: input.type,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        return { id: duplicate.id, created: false };
      }
    }
    throw error;
  }
}

async function shouldCreatePaymentNotification(clientId: string): Promise<boolean> {
  const settings = await prisma.clientSettings.findUnique({
    where: { clientId },
    select: { transactionAlerts: true },
  });
  if (!settings) return true;
  return settings.transactionAlerts;
}

function paymentNotificationType(
  status: TransactionStatus
): NotificationType {
  switch (status) {
    case TransactionStatus.SUCCESS:
      return NotificationType.PAYMENT_SUCCESS;
    case TransactionStatus.FAILED:
      return NotificationType.PAYMENT_FAILED;
    default:
      return NotificationType.PAYMENT_PENDING;
  }
}

function paymentNotificationSeverity(
  status: TransactionStatus
): NotificationSeverity {
  switch (status) {
    case TransactionStatus.SUCCESS:
      return NotificationSeverity.SUCCESS;
    case TransactionStatus.FAILED:
      return NotificationSeverity.ERROR;
    default:
      return NotificationSeverity.WARNING;
  }
}

function paymentNotificationTitle(
  status: TransactionStatus,
  providerMode: QRProviderMode
): string {
  const base =
    status === TransactionStatus.SUCCESS
      ? "Payment successful"
      : status === TransactionStatus.FAILED
        ? "Payment failed"
        : "Payment pending";
  return withProviderContext(base, providerMode);
}

export async function createPaymentNotificationFromProcessedEvent(
  paymentEventId: string,
  transactionId: string
): Promise<void> {
  const [paymentEvent, transaction] = await Promise.all([
    prisma.paymentEvent.findUnique({
      where: { id: paymentEventId },
      select: { id: true, providerMode: true },
    }),
    prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        merchant: { select: { businessName: true, merchantCode: true } },
        qrCode: { select: { qrName: true, qrIdentifier: true } },
      },
    }),
  ]);

  if (!paymentEvent || !transaction) return;

  const alertsEnabled = await shouldCreatePaymentNotification(transaction.clientId);
  if (!alertsEnabled) return;

  const amount = formatCurrency(decimalToNumber(transaction.amount));
  const type = paymentNotificationType(transaction.status);
  const severity = paymentNotificationSeverity(transaction.status);
  const title = paymentNotificationTitle(
    transaction.status,
    transaction.providerMode
  );
  const message = `${amount} for ${transaction.merchant.merchantCode} / ${transaction.qrCode.qrIdentifier}. Ref ${transaction.transactionId}.`;

  await createOperationalNotification({
    type,
    severity,
    title,
    message,
    clientId: transaction.clientId,
    merchantId: transaction.merchantId,
    transactionId: transaction.id,
    qrId: transaction.qrId,
    providerMode: transaction.providerMode,
    sourceType: NOTIFICATION_SOURCE_TYPES.PAYMENT_EVENT,
    sourceId: paymentEvent.id,
    linkPath: `/transactions/${transaction.id}`,
  });
}

export async function createPaymentNotificationSafely(
  paymentEventId: string,
  transactionId: string
): Promise<void> {
  try {
    await createPaymentNotificationFromProcessedEvent(
      paymentEventId,
      transactionId
    );
  } catch (error) {
    console.error("Failed to create payment notification:", error);
  }
}

export async function createQrNotification(input: {
  type: NotificationType;
  qrId: string;
  clientId: string;
  merchantId: string;
  providerMode: QRProviderMode;
  qrName: string;
  qrIdentifier: string;
  sourceId: string;
}): Promise<void> {
  const severity =
    input.type === NotificationType.QR_DEACTIVATED
      ? NotificationSeverity.WARNING
      : NotificationSeverity.INFO;

  const baseTitle =
    input.type === NotificationType.QR_CREATED
      ? "QR code created"
      : input.type === NotificationType.QR_ACTIVATED
        ? "QR code activated"
        : "QR code deactivated";

  const title = withProviderContext(baseTitle, input.providerMode);
  const message = `${input.qrName} (${input.qrIdentifier}) operational update.`;

  await createOperationalNotification({
    type: input.type,
    severity,
    title,
    message,
    clientId: input.clientId,
    merchantId: input.merchantId,
    qrId: input.qrId,
    providerMode: input.providerMode,
    sourceType: NOTIFICATION_SOURCE_TYPES.QR_CODE,
    sourceId: input.sourceId,
    linkPath: `/qr-codes/${input.qrId}`,
  });
}

export async function createMerchantStatusNotification(input: {
  type: NotificationType;
  merchantId: string;
  clientId: string;
  businessName: string;
  merchantCode: string;
  sourceId: string;
}): Promise<void> {
  const title =
    input.type === NotificationType.MERCHANT_ACTIVATED
      ? "Merchant activated"
      : "Merchant deactivated";
  const severity =
    input.type === NotificationType.MERCHANT_DEACTIVATED
      ? NotificationSeverity.WARNING
      : NotificationSeverity.INFO;

  await createOperationalNotification({
    type: input.type,
    severity,
    title,
    message: `${input.businessName} (${input.merchantCode}) status changed.`,
    clientId: input.clientId,
    merchantId: input.merchantId,
    sourceType: NOTIFICATION_SOURCE_TYPES.MERCHANT,
    sourceId: input.sourceId,
    linkPath: `/merchants/${input.merchantId}`,
  });
}

export async function createClientStatusNotification(input: {
  type: NotificationType;
  clientId: string;
  clientName: string;
  clientCode: string;
  sourceId: string;
}): Promise<void> {
  const title =
    input.type === NotificationType.CLIENT_ACTIVATED
      ? "Client activated"
      : "Client deactivated";
  const severity =
    input.type === NotificationType.CLIENT_DEACTIVATED
      ? NotificationSeverity.WARNING
      : NotificationSeverity.INFO;

  await createOperationalNotification({
    type: input.type,
    severity,
    title,
    message: `${input.clientName} (${input.clientCode}) status changed.`,
    clientId: input.clientId,
    sourceType: NOTIFICATION_SOURCE_TYPES.CLIENT,
    sourceId: input.sourceId,
    linkPath: `/clients/${input.clientId}`,
  });
}

export async function getNotificationsForUser(
  user: SessionUser,
  query: NotificationListQuery
): Promise<NotificationListResult> {
  const where = buildNotificationVisibilityWhere(user);
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        reads: {
          where: { userId: user.id },
          select: { readAt: true },
        },
      },
    }),
  ]);

  return {
    items: rows.map(mapNotificationRow),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getRecentNotificationsForUser(
  user: SessionUser,
  limit = NOTIFICATION_RECENT_LIMIT
): Promise<NotificationView[]> {
  const where = buildNotificationVisibilityWhere(user);
  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      reads: {
        where: { userId: user.id },
        select: { readAt: true },
      },
    },
  });
  return rows.map(mapNotificationRow);
}

export async function getUnreadNotificationCount(
  user: SessionUser
): Promise<number> {
  const where = buildNotificationVisibilityWhere(user);
  return prisma.notification.count({
    where: {
      ...where,
      reads: {
        none: {
          userId: user.id,
        },
      },
    },
  });
}

async function getAuthorizedNotification(
  user: SessionUser,
  notificationId: string
) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      reads: {
        where: { userId: user.id },
        select: { id: true, readAt: true },
      },
    },
  });

  if (!notification) {
    throw new NotificationServiceError("Notification not found", "NOT_FOUND");
  }

  const visibility = buildNotificationVisibilityWhere(user);
  const visible = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      ...visibility,
    },
    select: { id: true },
  });

  if (!visible) {
    throw new NotificationServiceError(
      "Access to this notification is not permitted",
      "FORBIDDEN"
    );
  }

  return notification;
}

export async function markNotificationRead(
  user: SessionUser,
  notificationId: string
): Promise<NotificationView> {
  const notification = await getAuthorizedNotification(user, notificationId);

  if (notification.reads.length === 0) {
    await prisma.notificationRead.create({
      data: {
        notificationId,
        userId: user.id,
      },
    });
  }

  const refreshed = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      reads: {
        where: { userId: user.id },
        select: { readAt: true },
      },
    },
  });

  if (!refreshed) {
    throw new NotificationServiceError("Notification not found", "NOT_FOUND");
  }

  return mapNotificationRow(refreshed);
}

export async function markAllNotificationsRead(
  user: SessionUser
): Promise<{ marked: number }> {
  const where = buildNotificationVisibilityWhere(user);
  const unread = await prisma.notification.findMany({
    where: {
      ...where,
      reads: {
        none: {
          userId: user.id,
        },
      },
    },
    select: { id: true },
  });

  if (unread.length === 0) {
    return { marked: 0 };
  }

  await prisma.notificationRead.createMany({
    data: unread.map((row) => ({
      notificationId: row.id,
      userId: user.id,
    })),
    skipDuplicates: true,
  });

  return { marked: unread.length };
}
