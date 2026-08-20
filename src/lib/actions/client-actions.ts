"use server";

import { ClientType, EntityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  requireAuthenticatedUser,
  requireRole,
} from "@/lib/auth/authorization";
import { createAuditLog } from "@/lib/audit/audit-log";
import { generateNextClientCode } from "@/lib/utils/client-code";
import { checkClientDuplicates } from "@/lib/services/client-service";
import {
  createClientSchema,
  updateClientSchema,
  updateClientStatusSchema,
} from "@/lib/validations/entities";
import { actionError, actionSuccess, type ActionResult } from "./types";

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createClientAction(
  input: unknown
): Promise<ActionResult<{ id: string; clientCode: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, ["SUPER_ADMIN"]);

    const parsed = createClientSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = parsed.data;

    const duplicateError = await checkClientDuplicates(data);
    if (duplicateError) {
      return actionError(duplicateError);
    }

    const clientCode = await generateNextClientCode();

    const client = await prisma.client.create({
      data: {
        id: clientCode,
        clientCode,
        name: data.name,
        type: data.type === "bank" ? ClientType.BANK : ClientType.PATSANSTHA,
        registrationNumber: data.registrationNumber,
        contactPerson: data.contactPerson,
        mobile: data.mobile,
        email: data.email,
        address: data.address,
        city: data.city,
        district: data.district,
        state: data.state,
        pinCode: data.pinCode,
        status: EntityStatus.PENDING,
      },
    });

    await createAuditLog({
      userId: user.id,
      action: "CLIENT_CREATED",
      entityType: "Client",
      entityId: client.id,
      metadata: { name: data.name, clientCode: client.clientCode },
    });

    return actionSuccess({ id: client.id, clientCode: client.clientCode });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return actionError("A client with this registration number already exists");
    }
    console.error("createClientAction:", error);
    return actionError("Unable to create client. Please try again.");
  }
}

export async function updateClientAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, ["SUPER_ADMIN"]);

    const parsed = updateClientSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { clientId, ...data } = parsed.data;

    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    if (!existing) {
      return actionError("Client not found");
    }

    const duplicateError = await checkClientDuplicates(data, clientId);
    if (duplicateError) {
      return actionError(duplicateError);
    }

    await prisma.client.update({
      where: { id: clientId },
      data: {
        name: data.name,
        type: data.type === "bank" ? ClientType.BANK : ClientType.PATSANSTHA,
        registrationNumber: data.registrationNumber,
        contactPerson: data.contactPerson,
        mobile: data.mobile,
        email: data.email,
        address: data.address,
        city: data.city,
        district: data.district,
        state: data.state,
        pinCode: data.pinCode,
      },
    });

    await createAuditLog({
      userId: user.id,
      clientId,
      action: "CLIENT_UPDATED",
      entityType: "Client",
      entityId: clientId,
      metadata: { name: data.name },
    });

    return actionSuccess({ id: clientId });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return actionError("A client with this registration number already exists");
    }
    console.error("updateClientAction:", error);
    return actionError("Unable to update client. Please try again.");
  }
}

export async function updateClientStatusAction(
  input: unknown
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, ["SUPER_ADMIN"]);

    const parsed = updateClientStatusSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { clientId, action } = parsed.data;

    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    if (!existing) {
      return actionError("Client not found");
    }

    let newStatus: EntityStatus;
    let auditAction: string;

    if (action === "activate") {
      if (existing.status === EntityStatus.ACTIVE) {
        return actionError("Client is already active");
      }
      newStatus = EntityStatus.ACTIVE;
      auditAction = "CLIENT_ACTIVATED";
    } else {
      if (existing.status !== EntityStatus.ACTIVE) {
        return actionError("Only active clients can be deactivated");
      }
      newStatus = EntityStatus.INACTIVE;
      auditAction = "CLIENT_DEACTIVATED";
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { status: newStatus },
    });

    await createAuditLog({
      userId: user.id,
      clientId,
      action: auditAction,
      entityType: "Client",
      entityId: clientId,
      metadata: {
        name: existing.name,
        previousStatus: existing.status,
        newStatus,
      },
    });

    return actionSuccess({
      id: clientId,
      status: newStatus.toLowerCase(),
    });
  } catch (error) {
    console.error("updateClientStatusAction:", error);
    return actionError("Unable to update client status. Please try again.");
  }
}
