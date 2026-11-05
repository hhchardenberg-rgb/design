import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: AppRole[];
      /** Dit account moet eerst tweestapsverificatie instellen (zie src/lib/auth-policy.ts). */
      mfaSetupRequired?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    roles?: AppRole[];
    sessionVersion?: number;
    mfaSetupRequired?: boolean;
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
    /** Moment van inloggen (ms); beheerders moeten na ADMIN_SESSION_MS opnieuw inloggen. */
    authAt?: number;
    /** User.sessionVersion bij inloggen; lager dan in de database = sessie vervallen. */
    sv?: number;
    mfaSetupRequired?: boolean;
    rolesCheckedAt?: number;
  }
}
