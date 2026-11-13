import { auth } from "@/lib/auth";
import { loadTicketsAccess } from "./authz.server";
import type { TicketPermission } from "./permissions";

/** Bevoegdheden voor een pagina; de layout heeft flag en toegang al gecontroleerd. */
export async function ticketsPageAccess(required: TicketPermission) {
  const session = await auth();
  const access = await loadTicketsAccess(session!.user.id);
  return { allowed: access.can(required), permissions: access.permissions, can: access.can, userId: session!.user.id };
}
