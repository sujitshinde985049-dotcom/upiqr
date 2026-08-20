import { prisma } from "@/lib/db/prisma";

const MERCHANT_CODE_PREFIX = "MER";
const MERCHANT_CODE_WIDTH = 6;

/**
 * Generates the next sequential merchant code (e.g. MER000001).
 */
export async function generateNextMerchantCode(): Promise<string> {
  const merchants = await prisma.merchant.findMany({
    select: { merchantCode: true },
  });

  let maxNumber = 0;
  const pattern = /^MER(\d+)$/i;

  for (const { merchantCode } of merchants) {
    const match = merchantCode.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  const next = maxNumber + 1;
  return `${MERCHANT_CODE_PREFIX}${String(next).padStart(MERCHANT_CODE_WIDTH, "0")}`;
}
