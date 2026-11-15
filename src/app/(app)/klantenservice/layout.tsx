import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole, resolveHomePath } from "@/lib/roles";

// Alle pagina's onder /klantenservice bevatten actuele databasedata en mogen dus
// nooit statisch geprerenderd worden (zelfde reden als (app)/layout.tsx).
export const dynamic = "force-dynamic";

/**
 * Extra, server-side controle bovenop middleware.ts: middleware beschermt
 * /klantenservice al op basis van de TICKETING-rol, maar deze layout is een
 * bewuste tweede laag zodat een eventuele fout in de middleware-matcher
 * nooit als enige verdediging overblijft. Wie zonder de rol TICKETING hier
 * toch terechtkomt, ziet nooit Klantenservice-inhoud — alleen een redirect.
 */
export default async function TicketingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/klantenservice");

  const roles = session.user.roles ?? [];
  if (!hasRole(roles, "TICKETING")) redirect(resolveHomePath(roles));

  return <>{children}</>;
}
