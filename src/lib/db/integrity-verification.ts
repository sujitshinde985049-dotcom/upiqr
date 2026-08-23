import { Prisma, PrismaClient } from "@prisma/client";

export type IntegrityCheckResult = {
  name: string;
  ok: boolean;
  anomalyCount: number;
  detail: string;
};

export type IntegrityVerificationResult = {
  ok: boolean;
  checks: IntegrityCheckResult[];
  tableCounts: Record<string, number>;
};

type CountRow = { count: bigint };

async function countAnomalies(
  prisma: PrismaClient,
  name: string,
  query: Prisma.Sql,
  detail: string
): Promise<IntegrityCheckResult> {
  const rows = await prisma.$queryRaw<CountRow[]>(query);
  const anomalyCount = Number(rows[0]?.count ?? 0);
  return {
    name,
    ok: anomalyCount === 0,
    anomalyCount,
    detail,
  };
}

export async function runDatabaseIntegrityVerification(
  prisma: PrismaClient
): Promise<IntegrityVerificationResult> {
  const checks: IntegrityCheckResult[] = [];

  checks.push(
    await countAnomalies(
      prisma,
      "User → Client",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "User" u
        LEFT JOIN "Client" c ON u."clientId" = c.id
        WHERE u."clientId" IS NOT NULL AND c.id IS NULL
      `,
      "Users with clientId must reference an existing Client"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "Merchant → Client",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Merchant" m
        LEFT JOIN "Client" c ON m."clientId" = c.id
        WHERE c.id IS NULL
      `,
      "Merchants must reference an existing Client"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "MERCHANT_USER → Merchant",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "User" u
        LEFT JOIN "Merchant" m ON u."merchantId" = m.id
        WHERE u.role = 'MERCHANT_USER'
          AND (u."merchantId" IS NULL OR m.id IS NULL)
      `,
      "MERCHANT_USER accounts must reference an existing Merchant"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "MERCHANT_USER client alignment",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "User" u
        JOIN "Merchant" m ON u."merchantId" = m.id
        WHERE u.role = 'MERCHANT_USER'
          AND u."clientId" IS NOT NULL
          AND u."clientId" <> m."clientId"
      `,
      "MERCHANT_USER clientId must match merchant clientId"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "QR → Merchant",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "QRCode" q
        LEFT JOIN "Merchant" m ON q."merchantId" = m.id
        WHERE m.id IS NULL
      `,
      "QR codes must reference an existing Merchant"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "QR/Merchant client alignment",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "QRCode" q
        JOIN "Merchant" m ON q."merchantId" = m.id
        WHERE q."clientId" <> m."clientId"
      `,
      "QR clientId must match merchant clientId"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "Transaction → QR",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Transaction" t
        LEFT JOIN "QRCode" q ON t."qrId" = q.id
        WHERE q.id IS NULL
      `,
      "Transactions must reference an existing QR"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "Transaction → Merchant",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Transaction" t
        LEFT JOIN "Merchant" m ON t."merchantId" = m.id
        WHERE m.id IS NULL
      `,
      "Transactions must reference an existing Merchant"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "Transaction → Client",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Transaction" t
        LEFT JOIN "Client" c ON t."clientId" = c.id
        WHERE c.id IS NULL
      `,
      "Transactions must reference an existing Client"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "Transaction tenant alignment",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Transaction" t
        JOIN "QRCode" q ON t."qrId" = q.id
        JOIN "Merchant" m ON t."merchantId" = m.id
        WHERE t."clientId" <> q."clientId"
           OR t."merchantId" <> q."merchantId"
           OR m."clientId" <> t."clientId"
      `,
      "Transaction client/merchant/QR relationships must align"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "PaymentEvent → Transaction",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "PaymentEvent" pe
        LEFT JOIN "Transaction" t ON pe."transactionId" = t.id
        WHERE pe."transactionId" IS NOT NULL AND t.id IS NULL
      `,
      "PaymentEvents with transactionId must reference an existing Transaction"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "PaymentEvent tenant alignment",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "PaymentEvent" pe
        JOIN "Transaction" t ON pe."transactionId" = t.id
        WHERE (pe."clientId" IS NOT NULL AND pe."clientId" <> t."clientId")
           OR (pe."merchantId" IS NOT NULL AND pe."merchantId" <> t."merchantId")
           OR (pe."qrId" IS NOT NULL AND pe."qrId" <> t."qrId")
      `,
      "PaymentEvent tenant fields must match linked Transaction when present"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "ClientSettings → Client",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "ClientSettings" cs
        LEFT JOIN "Client" c ON cs."clientId" = c.id
        WHERE c.id IS NULL
      `,
      "ClientSettings must reference an existing Client"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "Notification tenant alignment",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Notification" n
        LEFT JOIN "Merchant" m ON n."merchantId" = m.id
        WHERE n."merchantId" IS NOT NULL
          AND (
            m.id IS NULL
            OR (
              n."clientId" IS NOT NULL
              AND n."clientId" <> m."clientId"
            )
          )
      `,
      "Notification merchant/client relationships must align"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "NotificationRead → Notification",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "NotificationRead" nr
        LEFT JOIN "Notification" n ON nr."notificationId" = n.id
        WHERE n.id IS NULL
      `,
      "NotificationRead must reference an existing Notification"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "NotificationRead → User",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "NotificationRead" nr
        LEFT JOIN "User" u ON nr."userId" = u.id
        WHERE u.id IS NULL
      `,
      "NotificationRead must reference an existing User"
    )
  );

  checks.push(
    await countAnomalies(
      prisma,
      "NotificationRead tenant access",
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "NotificationRead" nr
        JOIN "Notification" n ON nr."notificationId" = n.id
        JOIN "User" u ON nr."userId" = u.id
        WHERE n."clientId" IS NOT NULL
          AND u."clientId" IS NOT NULL
          AND n."clientId" <> u."clientId"
          AND u.role NOT IN ('SUPER_ADMIN')
      `,
      "NotificationRead user must be authorized for notification client scope"
    )
  );

  const tableCounts = {
    clients: await prisma.client.count(),
    merchants: await prisma.merchant.count(),
    users: await prisma.user.count(),
    qrCodes: await prisma.qRCode.count(),
    transactions: await prisma.transaction.count(),
    paymentEvents: await prisma.paymentEvent.count(),
    notifications: await prisma.notification.count(),
    notificationReads: await prisma.notificationRead.count(),
  };

  return {
    ok: checks.every((check) => check.ok),
    checks,
    tableCounts,
  };
}

export function assertSchemaFinancialConstraints(schemaContent: string): {
  decimalMoneyType: boolean;
  providerTransactionUnique: boolean;
  paymentEventUnique: boolean;
} {
  return {
    decimalMoneyType: schemaContent.includes("@db.Decimal(12, 2)"),
    providerTransactionUnique: schemaContent.includes(
      "@@unique([provider, providerMode, providerTransactionId])"
    ),
    paymentEventUnique: schemaContent.includes(
      "@@unique([provider, providerMode, providerEventId])"
    ),
  };
}
