import type { ReportsQuery } from "@/lib/validations/reports";
import type { MonitoringQuery } from "@/lib/validations/monitoring";

export type ClientType = "bank" | "patsanstha";

export type EntityStatus = "active" | "inactive" | "pending";

export type TransactionStatus = "success" | "pending" | "failed";

export type PaymentRail = "HDFC" | "ICICI";

export type QRProviderMode = "mock" | "live" | "legacy";

export type UserRole =
  | "super_admin"
  | "client_admin"
  | "client_operator"
  | "merchant_user";

export interface Client {
  id: string;
  clientCode: string;
  name: string;
  type: ClientType;
  status: EntityStatus;
  contactPerson: string;
  mobile: string;
  email: string;
  registrationNumber?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pinCode?: string;
  createdAt: string;
}

export interface Merchant {
  id: string;
  merchantCode: string;
  clientId: string;
  businessName: string;
  accountHolderName: string;
  maskedCurrentAccountReference: string;
  currentAccountReference?: string;
  merchantCategory?: string;
  businessType?: string;
  gstNumber?: string;
  pan?: string;
  mobile: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pinCode?: string;
  status: EntityStatus;
  createdAt: string;
}

export interface QRCode {
  id: string;
  clientId: string;
  merchantId: string;
  sabpaisaQrId?: string;
  provider: string;
  providerMode: QRProviderMode;
  qrName: string;
  qrIdentifier: string;
  railId: PaymentRail;
  vpa: string;
  qrImageUrl?: string;
  upiString?: string;
  maxAmountPerTransaction?: number;
  description?: string;
  category?: string;
  notes?: string;
  isPayable: boolean;
  providerCreatedAt?: string;
  status: EntityStatus;
  createdAt: string;
}

export interface Transaction {
  id: string;
  clientId: string;
  merchantId: string;
  qrId: string;
  transactionId: string;
  provider: string;
  providerMode: QRProviderMode;
  providerTransactionId?: string;
  amount: number;
  status: TransactionStatus;
  railId?: PaymentRail;
  customerVpa: string;
  customerName?: string;
  referenceNumber?: string;
  bankReferenceNumber: string;
  paymentMethod: string;
  initiatedAt: string;
  completedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  clientId?: string;
  merchantId?: string;
  status: EntityStatus;
  lastLogin?: string;
  createdAt: string;
}

export interface ClientWithStats extends Client {
  totalMerchants: number;
  activeQr: number;
  todayCollection: number;
  totalCollection: number;
}

export interface MerchantWithStats extends Merchant {
  clientName: string;
  qrCount: number;
  transactionCount: number;
  todayCollection: number;
  totalCollection: number;
}

export interface QRCodeWithStats extends QRCode {
  merchantName: string;
  clientName: string;
  transactionCount: number;
  collection: number;
}

export interface TransactionWithRelations extends Transaction {
  merchantName: string;
  merchantCode: string;
  clientName: string;
  clientCode: string;
  qrName: string;
  qrIdentifier: string;
  createdAt: string;
  reconciliationStatus?: "NOT_APPLICABLE" | "UNVERIFIED" | "MATCHED" | "MISMATCH";
}

export interface TransactionSummaryMetrics {
  total: number;
  successful: number;
  pending: number;
  failed: number;
  successfulAmount: number;
  successfulAmountByProviderMode: {
    mock: number;
    legacy: number;
    live: number;
  };
}

export interface TransactionDetail extends TransactionWithRelations {
  paymentEvents: Array<{
    id: string;
    receivedAt: string;
    processedAt?: string;
    processingStatus: string;
    failureReasonCode?: string;
  }>;
}

export interface ManagedTransactionListResult {
  items: TransactionWithRelations[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: TransactionSummaryMetrics;
}

export interface DashboardKPIs {
  totalClients: number;
  totalMerchants: number;
  activeQrCodes: number;
  todayTransactions: number;
  todayCollection: number;
  totalCollection: number;
}

export interface QrOverview {
  total: number;
  active: number;
  inactive: number;
  mock: number;
}

export interface MerchantOverview {
  total: number;
  active: number;
  pending: number;
  inactive: number;
}

export interface DashboardMetrics {
  showPlatformClients: boolean;
  totalClients: number;
  totalMerchants: number;
  activeMerchants: number;
  pendingMerchants: number;
  inactiveMerchants: number;
  totalQrCodes: number;
  activeQrCodes: number;
  inactiveQrCodes: number;
  mockQrCodes: number;
  totalTransactions: number;
  successfulTransactions: number;
  pendingTransactions: number;
  failedTransactions: number;
  successfulAmount: number;
  successfulAmountByProviderMode: {
    mock: number;
    legacy: number;
    live: number;
  };
  dateWindow: "today" | "7days" | "30days";
  providerMode: "all" | "mock" | "legacy" | "live";
}

export interface DashboardData {
  metrics: DashboardMetrics;
  chartData: ChartDataPoint[];
  recentTransactions: TransactionWithRelations[];
  topClients: ClientWithStats[];
  recentMerchants: MerchantWithStats[];
  qrOverview: QrOverview;
  merchantOverview: MerchantOverview | null;
  query: {
    dateWindow: "today" | "7days" | "30days";
    providerMode: "all" | "mock" | "legacy" | "live";
    clientId?: string;
    merchantId?: string;
  };
}

export interface ReportsData {
  summary: TransactionSummaryMetrics;
  chartData: ChartDataPoint[];
  providerModeBreakdown: ProviderModeBreakdownRow[];
  merchantRows: MerchantReportRow[];
  qrRows: QrReportRow[];
  clientRows: ClientReportRow[];
  transactions: ManagedTransactionListResult;
  query: ReportsQuery;
}

export interface ProviderModeBreakdownRow {
  providerMode: "mock" | "legacy" | "live";
  total: number;
  successful: number;
  pending: number;
  failed: number;
  successfulAmount: number;
}

export interface MerchantReportRow {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantCode: string;
  clientName: string;
  total: number;
  successful: number;
  pending: number;
  failed: number;
  successfulAmount: number;
}

export interface QrReportRow {
  id: string;
  qrId: string;
  qrName: string;
  qrIdentifier: string;
  merchantName: string;
  providerMode: "mock" | "legacy" | "live";
  total: number;
  successful: number;
  successfulAmount: number;
}

export interface ClientReportRow {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  total: number;
  successful: number;
  pending: number;
  failed: number;
  successfulAmount: number;
}

export interface ChartDataPoint {
  date: string;
  label: string;
  amount: number;
  count: number;
}

export type PendingAgeBucket = "recent" | "aging" | "older";

export interface MonitoringSummary {
  activeQrCodes: number;
  inactiveQrCodes: number;
  mockQrCodes: number;
  pendingTransactions: number;
  failedTransactions: number;
  successfulTransactions: number;
  receivedPaymentEvents: number;
  processedPaymentEvents: number;
  rejectedPaymentEvents: number;
  failedPaymentEvents: number;
  duplicatePaymentEvents: number;
}

export interface PendingTransactionRow {
  id: string;
  transactionId: string;
  merchantName: string;
  merchantId: string;
  qrName: string;
  qrId: string;
  amount: number;
  providerMode: "mock" | "legacy" | "live";
  initiatedAt: string;
  ageMinutes: number;
  ageBucket: PendingAgeBucket;
}

export interface FailedTransactionRow {
  id: string;
  transactionId: string;
  merchantName: string;
  merchantId: string;
  qrName: string;
  qrId: string;
  amount: number;
  providerMode: "mock" | "legacy" | "live";
  initiatedAt: string;
  referenceNumber?: string;
}

export interface PaymentEventRow {
  id: string;
  provider: string;
  providerMode: "mock" | "legacy" | "live";
  processingStatus: string;
  receivedAt: string;
  processedAt?: string;
  failureReasonCode?: string;
  transactionId?: string;
}

export interface QrOperationalRow {
  id: string;
  qrName: string;
  qrIdentifier: string;
  merchantName: string;
  providerMode: "mock" | "legacy" | "live";
  status: "active" | "inactive" | "pending";
  isPayable: boolean;
  recentTransactionCount: number;
}

export interface AuditActivityRow {
  id: string;
  action: string;
  actorName?: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
}

export interface IntegrationReadiness {
  integrationMode: string;
  liveQrProvider: string;
  liveTransactionProvider: string;
  publicWebhook: string;
  apiCryptoInteroperability: string;
  webhookInteroperability: string;
}

export interface MonitoringData {
  summary: MonitoringSummary;
  pendingTransactions: PendingTransactionRow[];
  failedTransactions: FailedTransactionRow[];
  recentPaymentEvents: PaymentEventRow[];
  qrOverview: QrOperationalRow[];
  recentAuditActivity: AuditActivityRow[];
  integrationReadiness: IntegrationReadiness;
  query: MonitoringQuery;
}
