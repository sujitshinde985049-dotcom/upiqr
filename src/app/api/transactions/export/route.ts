import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import {
  exportManagedTransactionsCsv,
} from "@/lib/services/transaction-management-service";
import { TransactionServiceError } from "@/lib/services/transaction-service";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const rawQuery = Object.fromEntries(searchParams.entries());
    const result = await exportManagedTransactionsCsv(user, rawQuery);

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Export-Row-Count": String(result.rowCount),
        "X-Export-Max-Rows": "10000",
      },
    });
  } catch (error) {
    if (error instanceof TransactionServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "EXPORT_LIMIT_EXCEEDED" ? 400 : 422 }
      );
    }
    throw error;
  }
}
