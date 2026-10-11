import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";

/**
 * Her-authenticatie voor gevoelige accountwijzigingen (MFA uitschakelen,
 * de laatste passkey verwijderen, nieuwe herstelcodes genereren — zie
 * opdracht sectie 7). Vereist het HUIDIGE wachtwoord opnieuw, server-side
 * geverifieerd — een gestolen sessiecookie alleen is dan niet genoeg om
 * zo'n actie uit te voeren.
 */
export async function requireCurrentPassword(userId: string, password: string | undefined): Promise<void> {
  if (!password) throw new ApiError(400, "Bevestig deze actie met je huidige wachtwoord.");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new ApiError(401, "Niet ingelogd.");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(403, "Wachtwoord onjuist.");
}
