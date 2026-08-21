export function maskCustomerVpa(vpa: string | null | undefined): string {
  if (!vpa) return "";
  const [userPart, domainPart] = vpa.split("@");
  if (!domainPart) {
    return `${userPart.slice(0, 2)}****`;
  }
  const visible = userPart.slice(0, 2);
  return `${visible}****@${domainPart}`;
}

export function isMockProviderMode(
  providerMode: "mock" | "live" | "legacy"
): boolean {
  return providerMode === "mock" || providerMode === "legacy";
}

export function isLiveProviderMode(
  providerMode: "mock" | "live" | "legacy"
): boolean {
  return providerMode === "live";
}
