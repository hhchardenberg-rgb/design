import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe deel van de Auth.js-configuratie: geen providers, geen Prisma,
 * geen bcrypt. Wordt gebruikt door de middleware (draait op de Vercel Edge
 * Runtime, waar een dependency-zware config de Edge Function-bundel te
 * groot maakt). De volledige configuratie (met de Credentials-provider,
 * die wél Prisma/bcrypt nodig heeft) staat in auth.ts en draait alleen in
 * de gewone Node.js-runtime (API-route, server components).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: "USER" | "ADMIN" }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as "USER" | "ADMIN";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
