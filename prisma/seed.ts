import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/auth/password";
import { mockClients } from "../src/lib/mock-data/clients";
import { mockMerchants } from "../src/lib/mock-data/merchants";
import { mockQRCodes } from "../src/lib/mock-data/qr-codes";
import { mockTransactions } from "../src/lib/mock-data/transactions";
import {
  ClientType,
  EntityStatus,
  PaymentRail,
  TransactionStatus,
  UserRole,
} from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const defaultPassword =
  process.env.SEED_DEFAULT_PASSWORD ?? "DevPass@123";

function toEntityStatus(status: string): EntityStatus {
  return status.toUpperCase() as EntityStatus;
}

function toClientType(type: string): ClientType {
  return type.toUpperCase() as ClientType;
}

function toTransactionStatus(status: string): TransactionStatus {
  return status.toUpperCase() as TransactionStatus;
}

async function main() {
  console.log("Seeding MahaCred QR database...");

  const passwordHash = await hashPassword(defaultPassword);

  await prisma.auditLog.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.qRCode.deleteMany();
  await prisma.user.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.client.deleteMany();

  for (const client of mockClients) {
    await prisma.client.create({
      data: {
        id: client.id,
        clientCode: client.id,
        name: client.name,
        type: toClientType(client.type),
        registrationNumber: client.registrationNumber,
        contactPerson: client.contactPerson,
        mobile: client.mobile,
        email: client.email,
        address: client.address,
        city: client.city,
        district: client.district,
        state: client.state,
        pinCode: client.pinCode,
        status: toEntityStatus(client.status),
        createdAt: new Date(client.createdAt),
      },
    });
  }

  for (const merchant of mockMerchants) {
    await prisma.merchant.create({
      data: {
        id: merchant.id,
        merchantCode: merchant.id,
        clientId: merchant.clientId,
        businessName: merchant.businessName,
        accountHolderName: merchant.accountHolderName,
        currentAccountReference: merchant.currentAccountReference!,
        merchantCategory: merchant.merchantCategory,
        businessType: merchant.businessType,
        gstNumber: merchant.gstNumber,
        pan: merchant.pan,
        mobile: merchant.mobile,
        email: merchant.email,
        address: merchant.address,
        city: merchant.city,
        district: merchant.district,
        state: merchant.state,
        pinCode: merchant.pinCode,
        status: toEntityStatus(merchant.status),
        createdAt: new Date(merchant.createdAt),
      },
    });
  }

  for (const qr of mockQRCodes) {
    await prisma.qRCode.create({
      data: {
        id: qr.id,
        clientId: qr.clientId,
        merchantId: qr.merchantId,
        sabpaisaQrId: qr.sabpaisaQrId,
        qrName: qr.qrName,
        qrIdentifier: qr.qrIdentifier,
        railId: qr.railId as PaymentRail,
        vpa: qr.vpa,
        qrImageUrl: qr.qrImageUrl,
        maxAmountPerTransaction: qr.maxAmountPerTransaction,
        description: qr.description,
        category: qr.category,
        status: toEntityStatus(qr.status),
        createdAt: new Date(qr.createdAt),
      },
    });
  }

  for (const txn of mockTransactions) {
    await prisma.transaction.create({
      data: {
        id: txn.id,
        clientId: txn.clientId,
        merchantId: txn.merchantId,
        qrId: txn.qrId,
        transactionId: txn.transactionId,
        amount: txn.amount,
        status: toTransactionStatus(txn.status),
        customerVpa: txn.customerVpa,
        bankReferenceNumber: txn.bankReferenceNumber,
        paymentMethod: txn.paymentMethod,
        initiatedAt: new Date(txn.initiatedAt),
        completedAt: txn.completedAt ? new Date(txn.completedAt) : null,
      },
    });
  }

  const seedUsers = [
    {
      id: "USR001",
      name: "Super Admin",
      email: "admin@mahacred.in",
      role: UserRole.SUPER_ADMIN,
      clientId: null,
      merchantId: null,
      status: EntityStatus.ACTIVE,
    },
    {
      id: "USR002",
      name: "Rajesh Patil",
      email: "rajesh@sahyadrinagari.coop",
      role: UserRole.CLIENT_ADMIN,
      clientId: "CLT001",
      merchantId: null,
      status: EntityStatus.ACTIVE,
    },
    {
      id: "USR005",
      name: "Sneha Kulkarni",
      email: "sneha@sahyadrinagari.coop",
      role: UserRole.CLIENT_OPERATOR,
      clientId: "CLT001",
      merchantId: null,
      status: EntityStatus.ACTIVE,
    },
    {
      id: "USR003",
      name: "Priya Deshmukh",
      email: "priya@democoopbank.in",
      role: UserRole.CLIENT_ADMIN,
      clientId: "CLT002",
      merchantId: null,
      status: EntityStatus.ACTIVE,
    },
    {
      id: "USR004",
      name: "Amit Shinde",
      email: "amit@shreeelectronics.example.com",
      role: UserRole.MERCHANT_USER,
      clientId: "CLT001",
      merchantId: "MCH003",
      status: EntityStatus.ACTIVE,
    },
    {
      id: "USR006",
      name: "Krishna Desai",
      email: "krishna@krishnaent.example.com",
      role: UserRole.MERCHANT_USER,
      clientId: "CLT002",
      merchantId: "MCH005",
      status: EntityStatus.ACTIVE,
    },
    {
      id: "USR008",
      name: "Inactive User",
      email: "inactive@mahacred.in",
      role: UserRole.CLIENT_OPERATOR,
      clientId: "CLT005",
      merchantId: null,
      status: EntityStatus.INACTIVE,
    },
  ];

  for (const user of seedUsers) {
    await prisma.user.create({
      data: {
        ...user,
        passwordHash,
        createdAt: new Date(),
      },
    });
  }

  console.log("Seed completed successfully.");
  console.log(`Default dev password: ${defaultPassword}`);
  console.log("Super Admin: admin@mahacred.in");
  console.log("Client A Admin: rajesh@sahyadrinagari.coop");
  console.log("Client A Operator: sneha@sahyadrinagari.coop");
  console.log("Client B Admin: priya@democoopbank.in");
  console.log("Merchant User (Shree Electronics): amit@shreeelectronics.example.com");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
