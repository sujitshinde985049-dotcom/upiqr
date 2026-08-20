import { notFound } from "next/navigation";
import { AuthError, requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  getQRCodeByIdForUser,
  getQRStatsForUser,
  getTransactionsByQRIdForUser,
} from "@/lib/services/data-service";
import type { SessionUser } from "@/lib/auth/types";
import { QRDetailPageContent } from "./qr-detail-content";

async function loadQRDetail(id: string, user: SessionUser) {
  try {
    const qr = await getQRCodeByIdForUser(id, user);
    if (!qr) return null;

    const [stats, transactions] = await Promise.all([
      getQRStatsForUser(id, user),
      getTransactionsByQRIdForUser(id, user),
    ]);

    if (!stats) return null;

    return { qr, stats, transactions };
  } catch (error) {
    if (error instanceof AuthError && error.code === "FORBIDDEN") {
      return null;
    }
    throw error;
  }
}

export default async function QRDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const data = await loadQRDetail(id, user);

  if (!data) notFound();

  return <QRDetailPageContent {...data} />;
}
