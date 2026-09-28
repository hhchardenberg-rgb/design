import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole, resolveHomePath } from "@/lib/roles";

/**
 * Extra, server-side controle bovenop middleware.ts voor het beheren van
 * Ticketing-content: vereist zowel ADMIN als TICKETING, zodat een beheerder
 * zonder de Ticketing-rol Ticketing-handleidingen niet kan zien of bewerken
 * via het beheergedeelte.
 */
export default async function AdminTicketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/ticketing");

  const roles = session.user.roles ?? [];
  if (!hasRole(roles, "ADMIN") || !hasRole(roles, "TICKETING")) redirect(resolveHomePath(roles));

  return <>{children}</>;
}
