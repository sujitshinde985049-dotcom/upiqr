import { notFound } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { getManagedTransactionDetail } from "@/lib/services/transaction-management-service";
import { TransactionDetailContent } from "./transaction-detail-content";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthenticatedUser();
  const transaction = await getManagedTransactionDetail(user, id);

  if (!transaction) notFound();

  return <TransactionDetailContent transaction={transaction} user={user} />;
}
