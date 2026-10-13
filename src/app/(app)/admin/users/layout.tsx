import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { hasAnyAdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Gebruikersbeheer is voor iedereen met beheerrechten: de hoofdadmin, de beheerders van Communicatie en
 * Ticketing en de beheerders van Commerciële Zaken. Wat je er mag doen bepaalt de API per rol.
 */
export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/users");
  const allowed = hasAnyAdminRole(session.user.roles) || (isCommercialEnabled() && (await loadCommercialAccess(session.user.id)).can("rights:manage_rights"));
  if (!allowed) redirect("/geen-toegang");
  return <>{children}</>;
}
