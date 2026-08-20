import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createAuditLog } from "@/lib/audit/audit-log";
import type { SessionUser } from "@/lib/auth/types";

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role: SessionUser["role"];
    clientId: string | null;
    merchantId: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: SessionUser["role"];
    clientId: string | null;
    merchantId: string | null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString();

        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || user.status !== EntityStatus.ACTIVE) {
          await createAuditLog({
            action: "LOGIN_FAILED",
            entityType: "User",
            metadata: { email },
          });
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          await createAuditLog({
            userId: user.id,
            clientId: user.clientId,
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: user.id,
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        await createAuditLog({
          userId: user.id,
          clientId: user.clientId,
          action: "LOGIN_SUCCESS",
          entityType: "User",
          entityId: user.id,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
          merchantId: user.merchantId,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },
  pages: {
    signIn: "/login",
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
  trustHost: true,
  secret: process.env.AUTH_SECRET,
});
