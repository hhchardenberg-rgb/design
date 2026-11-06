import type { NextAuthConfig } from "next-auth";
import type { AppRole } from "@/lib/roles";
import { adminSessionExpired, SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/auth-policy";

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
  // Sessie vervalt na 7 dagen zonder gebruik; beheerders daarnaast na 12 uur (zie auth-policy.ts).
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.roles = (user as { roles: AppRole[] }).roles;
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        token.mfaSetupRequired = !!(user as { mfaSetupRequired?: boolean }).mfaSetupRequired;
        token.authAt = Date.now();
      }
      // Sessies van vóór deze regel: de 12 uur gaan nu in.
      if (typeof token.authAt !== "number") token.authAt = Date.now();
      if (adminSessionExpired(token.roles as string[] | undefined, token.authAt as number)) return null;
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
        session.user.mfaSetupRequired = !!token.mfaSetupRequired;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
