import { AppShell, type CommercialShellState } from "@/components/app-shell";
import { auth } from "@/lib/auth";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { loadNewsEnabled } from "@/lib/news.server";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";

// Alle pagina's hier vereisen een ingelogde gebruiker en actuele
// databasedata (templates, wedstrijden, ontwerpen) en mogen dus nooit
// statisch geprerenderd worden.
export const dynamic = "force-dynamic";

// Of Commerciële Zaken in het menu verschijnt wordt hier server-side bepaald
// (flag + lidmaatschap uit de database), niet uit het JWT.
async function commercialState(): Promise<CommercialShellState> {
  if (!isCommercialEnabled()) return { member: false, admin: false };
  const session = await auth();
  const user = session?.user;
  if (!user) return { member: false, admin: false };
  const access = await loadCommercialAccess(user.id);
  return { member: access.isMember, admin: access.can("rights:manage_rights") };
}

async function ticketsState(): Promise<boolean> {
  if (!isTicketsEnabled()) return false;
  const session = await auth();
  if (!session?.user) return false;
  return (await loadTicketsAccess(session.user.id)).hasAccess;
}

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [commercial, news, tickets] = await Promise.all([commercialState(), loadNewsEnabled(), ticketsState()]);
  return (
    <AppShell commercial={commercial} tickets={tickets} news={{ hub: news.hub, ticketing: news.ticketing }}>
      {children}
    </AppShell>
  );
}
