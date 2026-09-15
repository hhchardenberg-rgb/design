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
  items: g.modules.map((m) => ({ title: m.title, href: m.href, status: m.status })),
}));

const adminMenuGroups: NavMenuGroup[] = adminModuleGroups.map((g) => ({
  id: g.id,
  label: g.label,
  items: g.modules.map((m) => ({ title: m.title, href: m.href })),
}));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdminSection = pathname?.startsWith("/admin");
  const isDesigntoolSection =
    pathname?.startsWith("/dashboard") || pathname?.startsWith("/templates") || pathname?.startsWith("/designs");
  const nav = isAdminSection ? [] : isDesigntoolSection ? designtoolNav : [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/hub" className="flex items-center gap-2 font-bold">
            <Image src="/branding/hhc-logo.png" alt="HHC Hardenberg" width={32} height={40} className="h-10 w-8" priority />
            <span className="hidden sm:inline">HHC Hardenberg Hub</span>
          </Link>
          {nav.length > 0 && (
            <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
                    pathname?.startsWith(item.href) && "bg-surface-muted text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className={cn("flex items-center gap-2", nav.length === 0 && "flex-1 justify-end")}>
            {isAdminSection ? (
              <GroupedNavMenu groups={adminMenuGroups} label="Beheeronderdelen" />
            ) : (
              <GroupedNavMenu
                groups={hubMenuGroups}
                featured={{ title: featuredModule.title, href: featuredModule.href }}
                label="Onderdelen"
              />
            )}
            {session?.user?.role === "ADMIN" && (
              <Link
                href={isAdminSection ? "/hub" : "/admin"}
                className="hidden text-xs font-medium text-hhc-orange-dark hover:underline sm:inline"
              >
                {isAdminSection ? "Naar hub" : "Beheer"}
              </Link>
            )}
            <span className="hidden text-sm text-muted-foreground md:inline">{session?.user?.name}</span>
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
