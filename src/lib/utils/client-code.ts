import { prisma } from "@/lib/db/prisma";

const CLIENT_CODE_PREFIX = "CLT";
const CLIENT_CODE_WIDTH = 6;

/**
 * Generates the next sequential client code (e.g. CLT000001).
 * Parses existing CLT-prefixed codes and increments the highest numeric suffix.
 */
export async function generateNextClientCode(): Promise<string> {
  const clients = await prisma.client.findMany({
    select: { clientCode: true },
  });

  let maxNumber = 0;
  const pattern = /^CLT(\d+)$/i;

  for (const { clientCode } of clients) {
    const match = clientCode.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  const next = maxNumber + 1;
  return `${CLIENT_CODE_PREFIX}${String(next).padStart(CLIENT_CODE_WIDTH, "0")}`;
}
