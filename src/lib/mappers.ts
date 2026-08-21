import { EntityStatus, PaymentRail, TransactionStatus, ClientType, UserRole } from "@prisma/client";
import { maskAccountReference } from "@/lib/utils/mask-account-reference";
import type {
  Client,
  ClientType as UiClientType,
  EntityStatus as UiEntityStatus,
  Merchant,
  PaymentRail as UiPaymentRail,
  QRCode,
  Transaction,
  TransactionStatus as UiTransactionStatus,
  User,
} from "@/types";

export function toUiEntityStatus(status: EntityStatus): UiEntityStatus {
  return status.toLowerCase() as UiEntityStatus;
}

export function toUiClientType(type: ClientType): UiClientType {
  return type.toLowerCase() as UiClientType;
}

export function toUiPaymentRail(rail: PaymentRail): UiPaymentRail {
  return rail as UiPaymentRail;
}

export function toUiTransactionStatus(
  status: TransactionStatus
): UiTransactionStatus {
  return status.toLowerCase() as UiTransactionStatus;
}

export function toUiUserRole(role: UserRole): User["role"] {
  const map: Record<UserRole, User["role"]> = {
    SUPER_ADMIN: "super_admin",
    CLIENT_ADMIN: "client_admin",
    CLIENT_OPERATOR: "client_operator",
    MERCHANT_USER: "merchant_user",
  };
  return map[role];
}

export function decimalToNumber(value: { toString(): string }): number {
  return Number(value.toString());
}

type DbClient = {
  id: string;
  clientCode: string;
  name: string;
  type: ClientType;
  status: EntityStatus;
  contactPerson: string;
  mobile: string;
  email: string;
  registrationNumber: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pinCode: string | null;
  createdAt: Date;
};

export function mapClient(client: DbClient): Client {
  return {
    id: client.id,
    clientCode: client.clientCode,
    name: client.name,
    type: toUiClientType(client.type),
    status: toUiEntityStatus(client.status),
    contactPerson: client.contactPerson,
    mobile: client.mobile,
    email: client.email,
    registrationNumber: client.registrationNumber ?? undefined,
    address: client.address ?? undefined,
    city: client.city ?? undefined,
    district: client.district ?? undefined,
    state: client.state ?? undefined,
    pinCode: client.pinCode ?? undefined,
    createdAt: client.createdAt.toISOString(),
  };
}

type DbMerchant = {
  id: string;
  merchantCode: string;
  clientId: string;
  businessName: string;
  accountHolderName: string;
  currentAccountReference: string;
  merchantCategory: string | null;
  businessType: string | null;
  gstNumber: string | null;
  pan: string | null;
  mobile: string;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pinCode: string | null;
  status: EntityStatus;
  createdAt: Date;
};

export function mapMerchant(
  merchant: DbMerchant,
  options?: { includeAccountReference?: boolean }
): Merchant {
  return {
    id: merchant.id,
    merchantCode: merchant.merchantCode,
    clientId: merchant.clientId,
    businessName: merchant.businessName,
    accountHolderName: merchant.accountHolderName,
    maskedCurrentAccountReference: maskAccountReference(
      merchant.currentAccountReference
    ),
    currentAccountReference: options?.includeAccountReference
      ? merchant.currentAccountReference
      : undefined,
    merchantCategory: merchant.merchantCategory ?? undefined,
    businessType: merchant.businessType ?? undefined,
    gstNumber: merchant.gstNumber ?? undefined,
    pan: merchant.pan ?? undefined,
    mobile: merchant.mobile,
    email: merchant.email ?? undefined,
    address: merchant.address ?? undefined,
    city: merchant.city ?? undefined,
    district: merchant.district ?? undefined,
    state: merchant.state ?? undefined,
    pinCode: merchant.pinCode ?? undefined,
    status: toUiEntityStatus(merchant.status),
    createdAt: merchant.createdAt.toISOString(),
  };
}

type DbQRCode = {
  id: string;
  clientId: string;
  merchantId: string;
  sabpaisaQrId: string | null;
  provider: string;
  providerMode: "MOCK" | "LIVE" | "LEGACY";
  qrName: string;
  qrIdentifier: string;
  railId: PaymentRail;
  vpa: string | null;
  qrImageUrl: string | null;
  upiString: string | null;
  maxAmountPerTransaction: { toString(): string } | null;
  description: string | null;
  category: string | null;
  notes: string | null;
  isPayable: boolean;
  providerCreatedAt: Date | null;
  status: EntityStatus;
  createdAt: Date;
};

function toUiProviderMode(mode: DbQRCode["providerMode"]): QRCode["providerMode"] {
  return mode.toLowerCase() as QRCode["providerMode"];
}

export function mapQRCode(qr: DbQRCode): QRCode {
  return {
    id: qr.id,
    clientId: qr.clientId,
    merchantId: qr.merchantId,
    sabpaisaQrId: qr.sabpaisaQrId ?? undefined,
    provider: qr.provider,
    providerMode: toUiProviderMode(qr.providerMode),
    qrName: qr.qrName,
    qrIdentifier: qr.qrIdentifier,
    railId: toUiPaymentRail(qr.railId),
    vpa: qr.vpa ?? "",
    qrImageUrl: qr.qrImageUrl ?? undefined,
    upiString: qr.upiString ?? undefined,
    maxAmountPerTransaction: qr.maxAmountPerTransaction
      ? decimalToNumber(qr.maxAmountPerTransaction)
      : undefined,
    description: qr.description ?? undefined,
    category: qr.category ?? undefined,
    notes: qr.notes ?? undefined,
    isPayable: qr.isPayable,
    providerCreatedAt: qr.providerCreatedAt?.toISOString(),
    status: toUiEntityStatus(qr.status),
    createdAt: qr.createdAt.toISOString(),
  };
}

type DbTransaction = {
  id: string;
  clientId: string;
  merchantId: string;
  qrId: string;
  transactionId: string;
  amount: { toString(): string };
  status: TransactionStatus;
  customerVpa: string | null;
  bankReferenceNumber: string | null;
  paymentMethod: string | null;
  initiatedAt: Date;
  completedAt: Date | null;
};

export function mapTransaction(txn: DbTransaction): Transaction {
  return {
    id: txn.id,
    clientId: txn.clientId,
    merchantId: txn.merchantId,
    qrId: txn.qrId,
    transactionId: txn.transactionId,
    amount: decimalToNumber(txn.amount),
    status: toUiTransactionStatus(txn.status),
    customerVpa: txn.customerVpa ?? "",
    bankReferenceNumber: txn.bankReferenceNumber ?? "",
    paymentMethod: txn.paymentMethod ?? "",
    initiatedAt: txn.initiatedAt.toISOString(),
    completedAt: txn.completedAt?.toISOString(),
  };
}

type DbUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  clientId: string | null;
  merchantId: string | null;
  status: EntityStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export function mapUser(user: DbUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: toUiUserRole(user.role),
    clientId: user.clientId ?? undefined,
    merchantId: user.merchantId ?? undefined,
    status: toUiEntityStatus(user.status),
    lastLogin: user.lastLoginAt?.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}
