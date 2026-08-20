import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  getClientsForSelectors,
  getMerchantsForSelectors,
  getQRCodesWithStats,
} from "@/lib/services/data-service";
import { QRCodesPageContent } from "./qr-codes-content";

export default async function QRCodesPage() {
  const user = await requireAuthenticatedUser();

  const [qrCodes, clients, merchants] = await Promise.all([
    getQRCodesWithStats(user),
    getClientsForSelectors(user),
    getMerchantsForSelectors(user),
  ]);

  return (
    <QRCodesPageContent
      initialQRCodes={qrCodes}
      clients={clients}
      merchants={merchants}
    />
  );
}
