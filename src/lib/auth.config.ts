import type { NextAuthConfig } from "next-auth";
import type { AppRole } from "@/lib/roles";

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
        token.roles = (user as { roles: AppRole[] }).roles;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        // Fallback voor JWT's die zijn uitgegeven vóór de
        // meerdere-rollen-update (token.roles bestaat dan nog niet, maar
        // het oude token.role-claim wel) — zonder dit zou iedereen die al
        // was ingelogd tijdens de deploy tijdelijk alle toegang verliezen
        // totdat ze opnieuw inloggen.
        const fallbackRoles: AppRole[] = token.role === "ADMIN" ? ["ADMIN", "HUB"] : ["HUB"];
        const tokenRoles = token.roles as AppRole[] | undefined;
        session.user.roles = tokenRoles ?? fallbackRoles;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
