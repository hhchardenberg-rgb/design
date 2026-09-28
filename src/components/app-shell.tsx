"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GroupedNavMenu, type NavMenuGroup } from "@/components/grouped-nav-menu";
import { featuredModule, hubModuleGroups } from "@/lib/hub-modules";
import { adminModuleGroups } from "@/lib/admin-modules";
import { ticketingModules } from "@/lib/ticketing-modules";
import { hasRole, resolveHomePath, type AppRole } from "@/lib/roles";

// Sub-navigatie bínnen het designtool-onderdeel — apart van het apps-menu,
// zodat je niet elke keer een dropdown hoeft te openen om van "Nieuwe
// afbeelding" naar "Mijn ontwerpen" te wisselen.
const designtoolNav = [
  { href: "/dashboard", label: "Overzicht" },
  { href: "/templates", label: "Nieuwe afbeelding" },
  { href: "/designs", label: "Mijn ontwerpen" },
];

const hubMenuGroups: NavMenuGroup[] = hubModuleGroups.map((g) => ({
  id: g.id,
  label: g.label,
  items: g.modules.map((m) => ({ title: m.title, href: m.href, status: m.status, icon: m.icon })),
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
  { key: "admin", role: "ADMIN", label: "Beheer", href: "/admin" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];

  const isAdminSection = pathname?.startsWith("/admin");
  const isTicketingSection = !isAdminSection && pathname?.startsWith("/ticketing");
  const isDesigntoolSection =
    !isAdminSection &&
    !isTicketingSection &&
    (pathname?.startsWith("/dashboard") || pathname?.startsWith("/templates") || pathname?.startsWith("/designs"));
  const nav = isAdminSection || isTicketingSection ? [] : isDesigntoolSection ? designtoolNav : [];

  const adminMenuGroups: NavMenuGroup[] = adminModuleGroups
    .map((g) => ({
      id: g.id,
      label: g.label,
      items: g.modules
        .filter((m) => !m.requiredRole || hasRole(roles, m.requiredRole))
        .map((m) => ({ title: m.title, href: m.href, icon: m.icon })),
    }))
    .filter((g) => g.items.length > 0);

  const activeSectionKey = isAdminSection ? "admin" : isTicketingSection ? "ticketing" : "hub";
  const sections = SECTION_DEFINITIONS.filter((s) => hasRole(roles, s.role));
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
            ) : (
              <GroupedNavMenu
                groups={hubMenuGroups}
                featured={{ title: featuredModule.title, href: featuredModule.href, icon: featuredModule.icon }}
                label="Onderdelen"
              />
            )}
            {sections.length > 1 && (
              // Eigen scrollcontainer, los van de rest van deze rij: zo kan
              // dít stukje horizontaal scrollen op smalle schermen zonder
              // dat overflow op de buitenste rij het (absoluut gepositioneerde)
              // GroupedNavMenu-paneel afsnijdt.
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                {sections.map((s) => (
                  <Link key={s.key} href={s.href} className="shrink-0">
                    <Button variant={activeSectionKey === s.key ? "primary" : "outline"} size="sm" className="whitespace-nowrap">
                      {s.label}
                    </Button>
                  </Link>
                ))}
              </div>
            )}
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
