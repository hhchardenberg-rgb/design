import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/api-guards";
import { effectiveRoles } from "@/lib/roles";
import { isTicketsEnabled } from "./flag";
import { ALL_TICKET_PERMISSIONS, isTicketPermission, type TicketPermission } from "./permissions";

// Server-side autorisatie voor HHC Tickets. De hoofdadmin (superadmin) heeft alles. Ieder
// ander heeft toegang via een rol met HHC Tickets-toegang; de bevoegdheden van al iemands
// rollen tellen op. Rechten komen bij elk verzoek uit de database (niet uit het JWT), zodat
// intrekken direct werkt.

export interface TicketsAccess {
  userId: string;
  isSuperadmin: boolean;
  hasAccess: boolean;
  permissions: TicketPermission[];
  can: (p: TicketPermission) => boolean;
}

export async function loadTicketsAccess(userId: string): Promise<TicketsAccess> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, roles: true, accessRoles: { select: { role: { select: { ticketsAccess: true, ticketsPermissions: true } } } } },
  });
  if (!user) return { userId, isSuperadmin: false, hasAccess: false, permissions: [], can: () => false };
  if (effectiveRoles(user).includes("ADMIN")) {
    const all = new Set(ALL_TICKET_PERMISSIONS);
    return { userId, isSuperadmin: true, hasAccess: true, permissions: [...ALL_TICKET_PERMISSIONS], can: (p) => all.has(p) };
  }
  const roles = user.accessRoles.map((a) => a.role).filter((r) => r.ticketsAccess);
  const set = new Set<TicketPermission>();
  for (const r of roles) for (const p of r.ticketsPermissions) if (isTicketPermission(p)) set.add(p);
  const permissions = ALL_TICKET_PERMISSIONS.filter((p) => set.has(p));
  return { userId, isSuperadmin: false, hasAccess: roles.length > 0, permissions, can: (p) => set.has(p) };
}

export interface TicketsActor {
  id: string;
  name: string;
  access: TicketsAccess;
}

/** Vereist flag, sessie, toegang en ALLE genoemde bevoegdheden. Flag uit → 404. */
export async function requireTickets(...permissions: TicketPermission[]): Promise<TicketsActor> {
  if (!isTicketsEnabled()) throw new ApiError(404, "Niet gevonden.");
  const user = await requireUser();
  const access = await loadTicketsAccess(user.id);
  if (!access.hasAccess) throw new ApiError(403, "Je hebt geen toegang tot HHC Tickets.");
  if (permissions.some((p) => !access.can(p))) throw new ApiError(403, "Je hebt hiervoor geen bevoegdheid binnen HHC Tickets.");
  return { id: user.id, name: user.name || user.email || user.id, access };
}

export function need(actor: TicketsActor, p: TicketPermission) {
  if (!actor.access.can(p)) throw new ApiError(403, "Je hebt hiervoor geen bevoegdheid binnen HHC Tickets.");
}
