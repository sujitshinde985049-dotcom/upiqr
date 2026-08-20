/**
 * Masks a current account reference, showing only the last 4 characters.
 * Example: 1234567894582 → XXXXXXXXX4582
 */
export function maskAccountReference(reference: string): string {
  const trimmed = reference.trim();
  if (trimmed.length <= 4) {
    return "X".repeat(Math.max(trimmed.length, 4));
  }
  const visible = trimmed.slice(-4);
  const maskedLength = trimmed.length - 4;
  return `${"X".repeat(maskedLength)}${visible}`;
}
