import { notFound, redirect } from "next/navigation";
import {
  AuthError,
  canEditMerchant,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import { isSuperAdmin } from "@/lib/auth/types";
import { prisma } from "@/lib/db/prisma";
import { mapMerchant } from "@/lib/mappers";
import { getClientsForSelectors } from "@/lib/services/data-service";
import { MerchantEditPageContent } from "./merchant-edit-content";

async function loadMerchantForEdit(id: string) {
  const user = await requireAuthenticatedUser();

  if (!canEditMerchant(user)) {
    redirect(`/merchants/${id}`);
  }

  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!merchant) return null;

    const { requireMerchantAccess } = await import("@/lib/auth/authorization");
    await requireMerchantAccess(user, merchant.id, merchant.clientId);

    const clients = isSuperAdmin(user)
      ? await getClientsForSelectors(user)
      : [];

    return {
      merchant: {
        ...mapMerchant(merchant, { includeAccountReference: true }),
        clientName: merchant.client.name,
      },
      clients,
      isSuperAdmin: isSuperAdmin(user),
    };
  } catch (error) {
    if (error instanceof AuthError && error.code === "FORBIDDEN") {
      return null;
    }
    throw error;
  }
}

export default async function MerchantEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadMerchantForEdit(id);

  if (!data) notFound();

  return <MerchantEditPageContent {...data} />;
}
