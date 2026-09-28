import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: AppRole[];
    } & DefaultSession["user"];
  }

  interface User {
    roles?: AppRole[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: AppRole[];
    // Legacy claim — alleen aanwezig in JWT's die zijn uitgegeven vóór de
    // meerdere-rollen-update. Uitsluitend gebruikt als fallback in
    // auth.config.ts zodat wie al was ingelogd tijdens de deploy niet
    // tijdelijk alle toegang verliest.
    role?: "USER" | "ADMIN";
  }
}
