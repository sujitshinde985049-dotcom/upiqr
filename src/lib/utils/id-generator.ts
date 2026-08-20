export function generateEntityId(prefix: string): string {
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  return `${prefix}${suffix}`;
}
