import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSectionAdmin, resolveHomePath } from "@/lib/roles";

/**
 * Extra, server-side controle bovenop middleware.ts voor het beheren van
 * Klantenservice-content: vereist zowel ADMIN als TICKETING, zodat een beheerder
 * zonder de Klantenservice-rol Klantenservice-handleidingen niet kan zien of bewerken
 * via het beheergedeelte.
 */
export default async function AdminTicketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/klantenservice");

  const roles = session.user.roles ?? [];
  if (!isSectionAdmin(roles, "ticketing")) redirect(resolveHomePath(roles));

  return <>{children}</>;
}
