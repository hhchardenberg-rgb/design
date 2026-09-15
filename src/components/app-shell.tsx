"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HubAppsMenu } from "@/components/hub-apps-menu";

// Alle hub-onderdelen (Designtool, Agenda, Huisstijl, ...) zitten al in het
// apps-menu (HubAppsMenu) — hier staat alleen de sub-navigatie bínnen het
// designtool-onderdeel, zodat die niet dubbelop in de hoofdbalk staat.
const designtoolNav = [
  { href: "/dashboard", label: "Overzicht" },
  { href: "/templates", label: "Nieuwe afbeelding" },
  { href: "/designs", label: "Mijn ontwerpen" },
];

const adminNav = [
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/agenda", label: "Agenda" },
  { href: "/admin/fotobank", label: "Fotobank" },
  { href: "/admin/nieuws", label: "Nieuws" },
  { href: "/admin/kennisbank", label: "Kennisbank" },
  { href: "/admin/crisis", label: "Crisiscommunicatie" },
  { href: "/admin/matches", label: "Wedstrijden" },
  { href: "/admin/clubs", label: "Club & teams" },
  { href: "/admin/fonts", label: "Fonts" },
  { href: "/admin/colors", label: "Huisstijlkleuren" },
  { href: "/admin/users", label: "Gebruikers" },
  { href: "/docs", label: "Documentatie" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdminSection = pathname?.startsWith("/admin");
  const isDesigntoolSection =
    pathname?.startsWith("/dashboard") || pathname?.startsWith("/templates") || pathname?.startsWith("/designs");
  const nav = isAdminSection ? adminNav : isDesigntoolSection ? designtoolNav : [];

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
            <HubAppsMenu />
            {session?.user?.role === "ADMIN" && (
              <Link
                href={isAdminSection ? "/hub" : "/admin/templates"}
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
