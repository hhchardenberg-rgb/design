import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { normalizeEmail } from "@/lib/utils";
import { effectiveRoles } from "@/lib/roles";
import { checkLoginRateLimit, clientIpFrom, recordLoginAttempt } from "@/lib/login-rate-limit";

/** Aparte foutcode zodat de loginpagina een andere melding kan tonen dan "onjuiste combinatie". */
class TooManyAttemptsError extends CredentialsSignin {
  code = "too-many-attempts";
}

// Vaste, nergens aan een echt wachtwoord gekoppelde bcrypt-hash — gebruikt
// om bcrypt.compare() ook te laten draaien wanneer er geen gebruiker met
// het opgegeven e-mailadres bestaat, zodat de responstijd van een mislukte
// login niet verraadt of het e-mailadres wél of niet geregistreerd is.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8Dt0b1Fj5Y3OvKk2tLvfUFoPpINsAG";

// Volledige configuratie — alleen gebruikt in de Node.js-runtime (API-route
// api/auth/[...nextauth], server components/actions). Bevat de
// Credentials-provider met Prisma- en bcrypt-afhankelijkheden, die te zwaar
// zijn voor de Edge Runtime (zie auth.config.ts voor de middleware-variant).
export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mailadres", type: "email" },
        password: { label: "Wachtwoord", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const normalizedEmail = normalizeEmail(email);
        const ip = clientIpFrom(request);

        // Vóór het dure bcrypt-vergelijk: brute-force/credential-stuffing
        // afremmen. Zie src/lib/login-rate-limit.ts voor de drempels.
        const rateLimit = await checkLoginRateLimit(prisma, normalizedEmail, ip);
        if (rateLimit.limited) {
          throw new TooManyAttemptsError();
        }

        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        // Draait altijd een bcrypt-vergelijk — ook wanneer de gebruiker niet
        // bestaat (tegen een vaste dummy-hash) — zodat de responstijd geen
        // (zwak) signaal geeft of een e-mailadres wél een account heeft.
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

        await recordLoginAttempt(prisma, normalizedEmail, ip, Boolean(user && valid));

        if (!user || !valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: effectiveRoles(user),
        };
      },
    }),
  ],
});
