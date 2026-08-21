import QRCode from "qrcode";

export const TEST_QR_PAYLOAD_PREFIX = "MAHACRED_TEST_QR:";

export function buildTestQrPayload(localQrId: string): string {
  return `${TEST_QR_PAYLOAD_PREFIX}${localQrId}`;
}

export function isPayableUpiPayload(payload: string): boolean {
  const normalized = payload.trim().toLowerCase();
  return normalized.startsWith("upi://pay") || normalized.startsWith("upi://");
}

export async function generateTestQrPng(
  localQrId: string,
  size: number
): Promise<Buffer> {
  const payload = buildTestQrPayload(localQrId);
  if (isPayableUpiPayload(payload)) {
    throw new Error("Refusing to generate payable QR payload");
  }

  return QRCode.toBuffer(payload, {
    type: "png",
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}

export function generateTestQrSvg(localQrId: string, size: number): string {
  const payload = buildTestQrPayload(localQrId);
  const label = "TEST QR — NOT PAYABLE";
  const safePayload = escapeXml(payload);
  const safeId = escapeXml(localQrId);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 48}" viewBox="0 0 ${size} ${size + 48}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="8" y="8" width="${size - 16}" height="${size - 16}" fill="#f8fafc" stroke="#f59e0b" stroke-width="4" stroke-dasharray="8 4"/>
  <text x="${size / 2}" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#b45309">${label}</text>
  <text x="${size / 2}" y="${size / 2}" text-anchor="middle" font-family="monospace" font-size="12" fill="#334155">${safePayload}</text>
  <text x="${size / 2}" y="${size - 24}" text-anchor="middle" font-family="monospace" font-size="10" fill="#64748b">${safeId}</text>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
