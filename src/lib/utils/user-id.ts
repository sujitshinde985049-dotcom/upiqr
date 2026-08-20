import { prisma } from "@/lib/db/prisma";

const USER_ID_PREFIX = "USR";
const USER_ID_WIDTH = 6;

/**
 * Generates the next sequential user ID (e.g. USR000009).
 */
export async function generateNextUserId(): Promise<string> {
  const users = await prisma.user.findMany({ select: { id: true } });

  let maxNumber = 0;
  const pattern = /^USR(\d+)$/i;

  for (const { id } of users) {
    const match = id.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  const next = maxNumber + 1;
  return `${USER_ID_PREFIX}${String(next).padStart(USER_ID_WIDTH, "0")}`;
}
