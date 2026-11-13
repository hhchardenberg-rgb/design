import { prisma } from "@/lib/prisma";
import { effectiveRoles, type AppRole } from "@/lib/roles";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { mfaRequired } from "@/lib/auth-policy";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { ticketsNeedsMfa } from "@/lib/tickets/permissions";

export interface AuthState {
  roles: AppRole[];
  sessionVersion: number;
  mfaEnabled: boolean;
  mfaSetupRequired: boolean;
}

/** Actuele rollen, sessieversie en tweestapsstatus van een account; null als het account niet (meer) bestaat. */
export async function loadAuthState(userId: string): Promise<AuthState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      roles: true,
      sessionVersion: true,
      totpCredential: { select: { verifiedAt: true } },
      _count: { select: { webauthnCredentials: true } },
      commercialMembership: { select: { userId: true } },
      accessRoles: { select: { role: { select: { ticketsAccess: true, ticketsPermissions: true } } } },
    },
  });
  if (!user) return null;
  const roles = effectiveRoles(user);
  const mfaEnabled = !!user.totpCredential?.verifiedAt || user._count.webauthnCredentials > 0;
  // HHC Tickets: wie meer mag dan scannen (persoonsgegevens, uitgeven, beheer) heeft ook 2FA nodig.
  const ticketPerms = user.accessRoles.filter((a) => a.role.ticketsAccess).flatMap((a) => a.role.ticketsPermissions);
  const required = mfaRequired(roles, (isCommercialEnabled() && !!user.commercialMembership) || (isTicketsEnabled() && ticketsNeedsMfa(ticketPerms)));
  return { roles, sessionVersion: user.sessionVersion, mfaEnabled, mfaSetupRequired: required && !mfaEnabled };
}

/** Laat alle sessies van dit account vervallen (binnen een minuut, zie auth.ts). */
export async function bumpSessionVersion(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}
