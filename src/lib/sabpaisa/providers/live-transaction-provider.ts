import { assertLiveSabPaisaIntegrationReady } from "../mode";
import type {
  SabPaisaListQrTransactionsQuery,
  SabPaisaListQrTransactionsResponse,
  SabPaisaListTransactionsQuery,
  SabPaisaListTransactionsResponse,
  SabPaisaTransactionProvider,
  SabPaisaTransactionProviderRecord,
} from "../transaction-types";

export class LiveSabPaisaTransactionProvider
  implements SabPaisaTransactionProvider
{
  readonly mode = "live" as const;

  private failClosed(): never {
    assertLiveSabPaisaIntegrationReady();
    throw new Error("LIVE_INTEGRATION_NOT_READY");
  }

  async listTransactions(
    _records: SabPaisaTransactionProviderRecord[],
    _query: SabPaisaListTransactionsQuery
  ): Promise<SabPaisaListTransactionsResponse> {
    this.failClosed();
  }

  async listQRTransactions(
    _records: SabPaisaTransactionProviderRecord[],
    _query: SabPaisaListQrTransactionsQuery
  ): Promise<SabPaisaListQrTransactionsResponse> {
    this.failClosed();
  }
}
