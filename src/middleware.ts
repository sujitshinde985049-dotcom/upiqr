import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import {
  DEFAULT_POST_LOGIN_PATH,
  resolveSafePostLoginRedirect,
} from "@/lib/auth/safe-redirect";

const { auth } = NextAuth(authConfig);

const publicPaths = ["/login", "/api/auth", "/api/health", "/api/ready"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isPublic) {
    const session = await auth();
    if (session?.user && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  const session = await auth();
  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    const intendedPath = `${pathname}${request.nextUrl.search}`;
    const safeCallback = resolveSafePostLoginRedirect(intendedPath);
    if (safeCallback !== DEFAULT_POST_LOGIN_PATH) {
      loginUrl.searchParams.set("callbackUrl", safeCallback);
    }
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
