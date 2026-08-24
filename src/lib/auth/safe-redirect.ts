export const DEFAULT_POST_LOGIN_PATH = "/dashboard";

const BLOCKED_PATH_PREFIXES = ["/login"];

function isBlockedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") {
    return true;
  }
  return BLOCKED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Resolve a safe same-origin post-login redirect target.
 * Rejects external URLs, protocol-relative paths, traversal, and login loops.
 */
export function resolveSafePostLoginRedirect(
  callbackUrl: string | null | undefined
): string {
  if (!callbackUrl) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  const trimmed = callbackUrl.trim();
  if (trimmed.length === 0) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  if (
    trimmed.includes("://") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.includes(":") ||
    /%2f%2f/i.test(trimmed)
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  if (!trimmed.startsWith("/")) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  const queryIndex = trimmed.indexOf("?");
  const hashIndex = trimmed.indexOf("#");
  const endIndex =
    queryIndex === -1
      ? hashIndex === -1
        ? trimmed.length
        : hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);

  const pathname = trimmed.slice(0, endIndex).replace(/\/+/g, "/") || "/";
  const suffix = trimmed.slice(endIndex);

  if (isBlockedPath(pathname)) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  return `${pathname}${suffix}`;
}
