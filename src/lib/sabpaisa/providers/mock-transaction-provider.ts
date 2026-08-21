import type {
  SabPaisaListQrTransactionsQuery,
  SabPaisaListQrTransactionsResponse,
  SabPaisaListTransactionsQuery,
  SabPaisaListTransactionsResponse,
  SabPaisaTransactionProvider,
  SabPaisaTransactionProviderRecord,
} from "../transaction-types";

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function filterRecords(
  records: SabPaisaTransactionProviderRecord[],
  query: {
    status?: "success" | "pending" | "failed" | "all";
    from_date?: string;
    to_date?: string;
    search?: string;
    qr_id?: string;
  }
): SabPaisaTransactionProviderRecord[] {
  let filtered = [...records];

  if (query.qr_id) {
    filtered = filtered.filter(
      (record) =>
        record.qr_code_id === query.qr_id || record.localId === query.qr_id
    );
  }

  if (query.status && query.status !== "all") {
    filtered = filtered.filter((record) => record.status === query.status);
  }

  const fromDate = parseDate(query.from_date);
  const toDate = parseDate(query.to_date);
  if (fromDate) {
    filtered = filtered.filter(
      (record) => new Date(record.initiated_at) >= fromDate
    );
  }
  if (toDate) {
    filtered = filtered.filter(
      (record) => new Date(record.initiated_at) <= toDate
    );
  }

  if (query.search) {
    const needle = query.search.toLowerCase();
    filtered = filtered.filter((record) => {
      const haystack = [
        record.transaction_id,
        record.reference_number,
        record.bank_reference_number,
        record.customer_name,
        record.qr_identifier,
        record.qr_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  return filtered;
}

function sortRecords(
  records: SabPaisaTransactionProviderRecord[],
  sortBy: SabPaisaListTransactionsQuery["sort_by"],
  sortOrder: SabPaisaListTransactionsQuery["sort_order"]
): SabPaisaTransactionProviderRecord[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...records].sort((left, right) => {
    if (sortBy === "amount") {
      return (left.amount - right.amount) * direction;
    }
    if (sortBy === "status") {
      return left.status.localeCompare(right.status) * direction;
    }
    return (
      (new Date(left.initiated_at).getTime() -
        new Date(right.initiated_at).getTime()) *
      direction
    );
  });
}

function paginate<T>(
  records: T[],
  page: number,
  limit: number
): { items: T[]; total: number; page: number; limit: number } {
  const total = records.length;
  const start = (page - 1) * limit;
  return {
    items: records.slice(start, start + limit),
    total,
    page,
    limit,
  };
}

function toProviderTransaction(
  record: SabPaisaTransactionProviderRecord
) {
  return {
    id: record.localId,
    transaction_id: record.transaction_id,
    qr_code_id: record.qr_code_id,
    qr_identifier: record.qr_identifier,
    qr_name: record.qr_name,
    rail_id: record.rail_id,
    amount: record.amount,
    status: record.status,
    customer_vpa: record.customer_vpa,
    customer_name: record.customer_name,
    payment_method: record.payment_method,
    reference_number: record.reference_number,
    bank_reference_number: record.bank_reference_number,
    initiated_at: record.initiated_at,
    completed_at: record.completed_at,
  };
}

export class MockSabPaisaTransactionProvider
  implements SabPaisaTransactionProvider
{
  readonly mode = "mock" as const;

  async listTransactions(
    records: SabPaisaTransactionProviderRecord[],
    query: SabPaisaListTransactionsQuery
  ): Promise<SabPaisaListTransactionsResponse> {
    const filtered = sortRecords(
      filterRecords(records, query),
      query.sort_by,
      query.sort_order
    );
    const page = paginate(filtered, query.page, query.limit);
    const totalPages = page.limit > 0 ? Math.ceil(page.total / page.limit) : 0;

    return {
      success: true,
      message: "Transactions fetched successfully",
      data: {
        transactions: page.items.map(toProviderTransaction),
        pagination: {
          total: page.total,
          page: page.page,
          limit: page.limit,
          totalPages,
        },
      },
    };
  }

  async listQRTransactions(
    records: SabPaisaTransactionProviderRecord[],
    query: SabPaisaListQrTransactionsQuery
  ): Promise<SabPaisaListQrTransactionsResponse> {
    const filtered = filterRecords(records, {
      status: query.status ?? "all",
      from_date: query.from_date,
      to_date: query.to_date,
    }).sort(
      (left, right) =>
        new Date(right.initiated_at).getTime() -
        new Date(left.initiated_at).getTime()
    );
    const page = paginate(filtered, query.page, query.limit);
    const totalPages = page.limit > 0 ? Math.ceil(page.total / page.limit) : 0;

    return {
      success: true,
      message: "Transactions fetched successfully",
      data: {
        transactions: page.items.map(toProviderTransaction),
        pagination: {
          total: page.total,
          page: page.page,
          limit: page.limit,
          total_pages: totalPages,
        },
      },
    };
  }
}
