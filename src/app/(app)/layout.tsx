import { AppShell, type CommercialShellState } from "@/components/app-shell";
import type { NextMatch, PlainNavGroup } from "@/components/shell/types";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { visibleNavGroups } from "@/lib/commercial/navigation";
import { isNewsEnabled, loadNewsEnabled } from "@/lib/news.server";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { visibleTicketsNav } from "@/lib/tickets/navigation";

// Alle pagina's hier vereisen een ingelogde gebruiker en actuele
// databasedata (templates, wedstrijden, ontwerpen) en mogen dus nooit
// statisch geprerenderd worden.
export const dynamic = "force-dynamic";

// Of Commerciële Zaken in het menu verschijnt, en met welke menu-items, wordt
// hier server-side bepaald (flag + lidmaatschap + rechten uit de database), niet uit het JWT.
async function commercialState(userId: string | undefined): Promise<CommercialShellState> {
  if (!isCommercialEnabled() || !userId) return { member: false, admin: false };
  const access = await loadCommercialAccess(userId);
  if (!access.isMember) return { member: false, admin: access.can("rights:manage_rights") };
  // Staat het nieuws uit, dan houden alleen de beheerders de link om het weer aan te zetten.
  const news = (await isNewsEnabled("commercial")) || access.can("settings:manage_settings");
  const nav: PlainNavGroup[] = visibleNavGroups(access.can, { news }).map((g) => ({ id: g.id, label: g.label, items: g.items.map((i) => ({ href: i.href, label: i.label })) }));
  return { member: true, admin: access.can("rights:manage_rights"), nav };
}

async function ticketsState(userId: string | undefined): Promise<{ hasAccess: boolean; supportSearch: boolean; nav: PlainNavGroup[] }> {
  if (!isTicketsEnabled() || !userId) return { hasAccess: false, supportSearch: false, nav: [] };
  const access = await loadTicketsAccess(userId);
  const nav = access.hasAccess ? visibleTicketsNav(access.can).map((g) => ({ id: g.id, label: g.label, items: g.items.map((i) => ({ href: i.href, label: i.label })) })) : [];
  return { hasAccess: access.hasAccess, supportSearch: access.hasAccess && access.can("support:search"), nav };
}

// De eerstvolgende wedstrijd (van vandaag of later) voor de wedstrijdchip in de kopbalk.
async function loadNextMatch(): Promise<NextMatch | null> {
  const since = new Date(Date.now() - 2 * 3600_000);
  const m = await prisma.match
    .findFirst({ where: { date: { gte: since }, status: { not: "CANCELLED" } }, orderBy: { date: "asc" }, include: { team: true, opponent: true } })
    .catch(() => null);
  if (!m) return null;
  const club = m.team.shortName ?? m.team.name;
  const opp = m.opponent.shortName ?? m.opponent.name;
  return { id: m.id, home: m.isHome ? club : opp, away: m.isHome ? opp : club, isHome: m.isHome, date: m.date.toISOString(), competition: m.competition };
}

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;
  const [commercial, news, tickets, nextMatch] = await Promise.all([
    commercialState(userId),
    loadNewsEnabled(),
    ticketsState(userId),
    hasRole(session?.user?.roles, "HUB") ? loadNextMatch() : Promise.resolve(null),
  ]);
  return (
    <AppShell
      commercial={commercial}
      tickets={tickets.hasAccess}
      ticketsNav={tickets.nav}
      supportSearch={tickets.supportSearch}
      news={{ hub: news.hub, ticketing: news.ticketing }}
      nextMatch={nextMatch}
    >
      {children}
    </AppShell>
  );
}
