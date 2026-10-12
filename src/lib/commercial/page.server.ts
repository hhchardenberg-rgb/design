import { auth } from "@/lib/auth";
import { loadCommercialAccess } from "./authz.server";
import type { Permission } from "./permissions";

/** Bevoegdheden van de ingelogde gebruiker voor een pagina; de layout heeft lidmaatschap en flag al gecontroleerd. */
export async function pageAccess(required: Permission): Promise<{ allowed: boolean; permissions: Permission[]; userId: string }> {
  const session = await auth();
  const access = await loadCommercialAccess(session!.user.id);
  return { allowed: access.can(required), permissions: [...access.allowed], userId: session!.user.id };
}
