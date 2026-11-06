"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Briefcase, Megaphone, Settings, Ticket } from "lucide-react";
import { GroupedNavMenu, type NavMenuGroup } from "@/components/grouped-nav-menu";
import { SectionSwitcher, type SectionLink } from "@/components/section-switcher";
import { featuredModule, hubModuleGroups } from "@/lib/hub-modules";
import { visibleAdminGroups } from "@/lib/admin-modules";
import { ticketingModules } from "@/lib/ticketing-modules";
import { hasAnyAdminRole, hasRole, resolveHomePath, type AppRole } from "@/lib/roles";

// Sub-navigatie bínnen het designtool-onderdeel — apart van het apps-menu,
// zodat je niet elke keer een dropdown hoeft te openen om van "Nieuwe
// afbeelding" naar "Mijn ontwerpen" te wisselen.
// Staat als eigen balk onder de kopregel (geen swipe-menu): op smalle
// schermen drie even brede knoppen met korte labels, vanaf `sm` de volle labels.
const designtoolNav = [
  { href: "/dashboard", label: "Overzicht", short: "Overzicht" },
  { href: "/templates", label: "Nieuwe afbeelding", short: "Nieuw" },
  { href: "/designs", label: "Mijn ontwerpen", short: "Ontwerpen" },
];

// In het Onderdelen-menu staat de designtool gewoon tussen de bronnen en
// hulpmiddelen; alleen de hub-startpagina geeft hem een eigen, grote tegel.
// Staat het nieuws van een onderdeel uit, dan valt de Nieuws-link uit het menu.
function hubMenuGroups(newsEnabled: boolean): NavMenuGroup[] {
  return hubModuleGroups.map((g) => ({
    id: g.id,
    label: g.label,
    items: (g.id === "bronnen" ? [featuredModule, ...g.modules] : g.modules)
      .filter((m) => m.id !== "nieuws" || newsEnabled)
      .map((m) => ({
        title: m.title,
        href: m.href,
        status: m.status,
        icon: m.icon,
      })),
  }));
}

function ticketingMenuGroups(newsEnabled: boolean): NavMenuGroup[] {
  return [
    {
      id: "ticketing",
      label: "Ticketing",
      items: ticketingModules
        .filter((m) => m.id !== "nieuws" || newsEnabled)
        .map((m) => ({ title: m.title, href: m.href, status: m.status, icon: m.icon })),
    },
  ];
}

// Top-level onderdelen ("apps") — enkel getoond aan wie er rechten voor
// heeft. Nieuwe rol met een eigen sectie? Hier een entry toevoegen.
const SECTION_DEFINITIONS: (SectionLink & { role: AppRole })[] = [
  { key: "hub", role: "HUB", label: "Communicatie", href: "/hub", icon: Megaphone },
  { key: "ticketing", role: "TICKETING", label: "Ticketing", href: "/ticketing", icon: Ticket },
];

export interface CommercialShellState {
  /** Heeft de gebruiker toegang tot de sectie (server-side bepaald, flag + lidmaatschap). */
  member: boolean;
  /** Beheerder van Commerciële Zaken (rechtenbeheer) of hoofdadmin: mag naar Beheer. */
  admin: boolean;
}

export function AppShell({
  children,
  commercial,
  news,
}: {
  children: React.ReactNode;
  commercial: CommercialShellState;
  /** Of het nieuws van Communicatie en Ticketing aan staat (server-side uit de database). */
  news: { hub: boolean; ticketing: boolean };
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];

  const isAdminSection = pathname?.startsWith("/admin");
  const isTicketingSection = !isAdminSection && pathname?.startsWith("/ticketing");
  const isCommercialSection = !isAdminSection && pathname?.startsWith("/commercieel");
  const isDesigntoolSection =
    !isAdminSection &&
    !isTicketingSection &&
    (pathname?.startsWith("/dashboard") || pathname?.startsWith("/templates") || pathname?.startsWith("/designs"));
  const nav = isAdminSection || isTicketingSection ? [] : isDesigntoolSection ? designtoolNav : [];

  const adminMenuGroups: NavMenuGroup[] = visibleAdminGroups(roles, commercial.admin).map((g) => ({
    id: g.id,
    label: g.label,
    items: g.modules.map((m) => ({ title: m.title, href: m.href, icon: m.icon })),
  }));

  const isAccountSection = pathname?.startsWith("/account");
  const activeSectionKey = isAccountSection
    ? "account"
    : isAdminSection
      ? "admin"
      : isTicketingSection
        ? "ticketing"
        : isCommercialSection
          ? "commercial"
          : "hub";
  const sections: SectionLink[] = SECTION_DEFINITIONS.filter((s) => hasRole(roles, s.role));
  // Commerciële Zaken: alleen leden (en hoofdadmins) zien deze sectie.
  if (commercial.member) sections.push({ key: "commercial", label: "Commerciële Zaken", href: "/commercieel", icon: Briefcase });
  // Eén beheer voor iedereen met beheerrechten, ongeacht het onderdeel.
  if (hasAnyAdminRole(roles) || commercial.admin) sections.push({ key: "admin", label: "Beheer", href: "/admin", icon: Settings });
  // Met maar één app valt er niets te wisselen; dan alleen Profiel/Uitloggen.
  const appLinks: SectionLink[] = sections.length > 1 ? sections.map(({ key, label, href, icon }) => ({ key, label, href, icon })) : [];
  const homeHref = resolveHomePath(roles);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
          <Link href={homeHref} className="flex shrink-0 items-center gap-2 font-bold">
            <Image src="/branding/hhc-logo.png" alt="HHC Hardenberg" width={32} height={40} className="h-10 w-8" priority />
            <span className="hidden sm:inline">HHC Hardenberg Hub</span>
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
            {isAdminSection ? (
              <GroupedNavMenu groups={adminMenuGroups} label="Beheeronderdelen" />
            ) : isTicketingSection ? (
              <GroupedNavMenu groups={ticketingMenuGroups(news.ticketing)} label="Onderdelen" />
            ) : isCommercialSection ? null : (
              <GroupedNavMenu groups={hubMenuGroups(news.hub)} label="Onderdelen" />
            )}
            <SectionSwitcher
              apps={appLinks}
              activeKey={activeSectionKey}
              accountHref="/account/profiel"
              onSignOut={() => signOut({ callbackUrl: "/login" })}
            />
          </div>
        </div>
        {nav.length > 0 && (
          <nav aria-label="Designtool" className="border-t border-border">
            <div className="mx-auto grid max-w-6xl grid-cols-3 px-4 sm:flex sm:gap-2">
              {nav.map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative px-1 py-2.5 text-center text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                    {active && <span aria-hidden className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-hhc-orange sm:inset-x-3" />}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
