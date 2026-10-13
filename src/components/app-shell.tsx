"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GroupedNavMenu, type NavMenuGroup } from "@/components/grouped-nav-menu";
import { SectionSwitcher, type SectionLink } from "@/components/section-switcher";
import { featuredModule, hubModuleGroups } from "@/lib/hub-modules";
import { visibleAdminGroups } from "@/lib/admin-modules";
import { ticketingModules } from "@/lib/ticketing-modules";
import { hasAnyAdminRole, hasRole, resolveHomePath, type AppRole } from "@/lib/roles";

// Sub-navigatie bínnen het designtool-onderdeel — apart van het apps-menu,
// zodat je niet elke keer een dropdown hoeft te openen om van "Nieuwe
// afbeelding" naar "Mijn ontwerpen" te wisselen.
const designtoolNav = [
  { href: "/dashboard", label: "Overzicht" },
  { href: "/templates", label: "Nieuwe afbeelding" },
  { href: "/designs", label: "Mijn ontwerpen" },
];

// In het Onderdelen-menu staat de designtool gewoon tussen de bronnen en
// hulpmiddelen; alleen de hub-startpagina geeft hem een eigen, grote tegel.
const hubMenuGroups: NavMenuGroup[] = hubModuleGroups.map((g) => ({
  id: g.id,
  label: g.label,
  items: (g.id === "bronnen" ? [featuredModule, ...g.modules] : g.modules).map((m) => ({
    title: m.title,
    href: m.href,
    status: m.status,
    icon: m.icon,
  })),
}));

const ticketingMenuGroups: NavMenuGroup[] = [
  {
    id: "ticketing",
    label: "Ticketing",
    items: ticketingModules.map((m) => ({ title: m.title, href: m.href, status: m.status, icon: m.icon })),
  },
];

// Drie mogelijke top-level secties — enkel getoond aan wie er rechten voor
// heeft. Nieuwe rol met een eigen sectie? Hier een entry toevoegen.
const SECTION_DEFINITIONS: { key: string; role: AppRole; label: string; href: string }[] = [
  { key: "hub", role: "HUB", label: "Communicatie", href: "/hub" },
  { key: "ticketing", role: "TICKETING", label: "Ticketing", href: "/ticketing" },
];

export interface CommercialShellState {
  /** Heeft de gebruiker toegang tot de sectie (server-side bepaald, flag + lidmaatschap). */
  member: boolean;
  /** Beheerder van Commerciële Zaken (rechtenbeheer) of hoofdadmin: mag naar Beheer. */
  admin: boolean;
}

export function AppShell({ children, commercial }: { children: React.ReactNode; commercial: CommercialShellState }) {
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
  if (commercial.member) sections.push({ key: "commercial", label: "Commerciële Zaken", href: "/commercieel" });
  // Eén beheer voor iedereen met beheerrechten, ongeacht het onderdeel.
  if (hasAnyAdminRole(roles) || commercial.admin) sections.push({ key: "admin", label: "Beheer", href: "/admin" });
  const sectionLinks: SectionLink[] = [
    ...(sections.length > 1 ? sections : []),
    { key: "account", label: "Accountbeveiliging", href: "/account/security" },
  ];
  const homeHref = resolveHomePath(roles);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
          <Link href={homeHref} className="flex shrink-0 items-center gap-2 font-bold">
            <Image src="/branding/hhc-logo.png" alt="HHC Hardenberg" width={32} height={40} className="h-10 w-8" priority />
            <span className="hidden sm:inline">HHC Hardenberg Hub</span>
          </Link>
          {nav.length > 0 && (
            <div className="relative min-w-0 flex-1">
              <nav className="flex items-center gap-1 overflow-x-auto text-sm">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "whitespace-nowrap rounded-md px-2 py-2 font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground sm:px-3",
                      pathname?.startsWith(item.href) && "bg-surface-muted text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface to-transparent" />
            </div>
          )}
          <div className={cn("relative flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2", nav.length === 0 && "flex-1 justify-end")}>
            {isAdminSection ? (
              <GroupedNavMenu groups={adminMenuGroups} label="Beheeronderdelen" />
            ) : isTicketingSection ? (
              <GroupedNavMenu groups={ticketingMenuGroups} label="Onderdelen" />
            ) : isCommercialSection ? null : (
              <GroupedNavMenu groups={hubMenuGroups} label="Onderdelen" />
            )}
            <SectionSwitcher items={sectionLinks} activeKey={activeSectionKey} />
            <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
              Uitloggen
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
