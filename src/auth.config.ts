import type { NextAuthConfig } from "next-auth";
import type { SessionUser } from "@/lib/auth/types";

/**
 * Edge-compatible Auth.js configuration shared by middleware and server auth.
 * Must not import Prisma, audit logging, observability, or other Node-only modules.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.clientId = user.clientId;
        token.merchantId = user.merchantId;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          id: token.id as string,
          name: session.user?.name ?? "",
          email: session.user?.email ?? "",
          role: token.role as SessionUser["role"],
          clientId: (token.clientId as string | null | undefined) ?? null,
          merchantId: (token.merchantId as string | null | undefined) ?? null,
        },
      };
    },
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
