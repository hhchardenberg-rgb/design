import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { normalizeEmail } from "@/lib/utils";
import { effectiveRoles } from "@/lib/roles";
import { checkLoginRateLimit, clientIpFrom, recordLoginAttempt } from "@/lib/login-rate-limit";
import { hasTotpEnabled, verifyTotpLogin, verifyRecoveryCodeLogin } from "@/lib/mfa/totp-service";

/** Aparte foutcode zodat de loginpagina een andere melding kan tonen dan "onjuiste combinatie". */
class TooManyAttemptsError extends CredentialsSignin {
  code = "too-many-attempts";
}

/**
 * Wachtwoord was correct, maar dit account heeft tweestapsverificatie
 * actief en er is nog geen code meegestuurd. Geen echte foutmelding — de
 * client herkent deze code en toont het code-invoerveld, waarna hetzelfde
 * formulier (e-mail + wachtwoord + code) in één keer opnieuw wordt
 * verzonden. Er bestaat op geen enkel moment een sessie die wél is
 * ingelogd maar nog geen MFA heeft doorlopen — authorize() geeft pas een
 * gebruiker terug nadat zowel wachtwoord als code (of herstelcode) kloppen.
 */
class MfaRequiredError extends CredentialsSignin {
  code = "mfa-required";
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
        totpCode: { label: "Verificatiecode", type: "text" },
        recoveryCode: { label: "Herstelcode", type: "text" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const totpCode = (credentials?.totpCode as string | undefined)?.trim();
        const recoveryCode = (credentials?.recoveryCode as string | undefined)?.trim();
        if (!email || !password) return null;

        const normalizedEmail = normalizeEmail(email);
        const ip = clientIpFrom(request);

        // Vóór het dure bcrypt-vergelijk: brute-force/credential-stuffing
        // afremmen. Zie src/lib/login-rate-limit.ts voor de drempels. Dekt
        // zowel wachtwoord- als code-pogingen, want beide lopen via dit
        // zelfde authorize()-pad.
        const rateLimit = await checkLoginRateLimit(prisma, normalizedEmail, ip);
        if (rateLimit.limited) {
          throw new TooManyAttemptsError();
        }

        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        // Draait altijd een bcrypt-vergelijk — ook wanneer de gebruiker niet
        // bestaat (tegen een vaste dummy-hash) — zodat de responstijd geen
        // (zwak) signaal geeft of een e-mailadres wél een account heeft.
        const passwordValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

        if (!user || !passwordValid) {
          await recordLoginAttempt(prisma, normalizedEmail, ip, false);
          return null;
        }

        const mfaEnabled = await hasTotpEnabled(prisma, user.id);
        if (mfaEnabled) {
          if (!totpCode && !recoveryCode) {
            // Wachtwoord klopt, maar de tweede factor is nog niet
            // meegestuurd — geen succes én geen mislukking, dus (nog) geen
            // rij in LoginAttempt: het echte resultaat volgt pas hieronder,
            // op de volgende aanroep met de code erbij.
            throw new MfaRequiredError();
          }

          const codeValid = totpCode
            ? await verifyTotpLogin(prisma, user.id, totpCode)
            : await verifyRecoveryCodeLogin(prisma, user.id, recoveryCode!);

          if (!codeValid) {
            await recordLoginAttempt(prisma, normalizedEmail, ip, false);
            return null;
          }
        }

        await recordLoginAttempt(prisma, normalizedEmail, ip, true);

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
