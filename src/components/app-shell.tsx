"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const userNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/templates", label: "Nieuwe afbeelding" },
  { href: "/designs", label: "Mijn ontwerpen" },
];

const adminNav = [
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/matches", label: "Wedstrijden" },
  { href: "/admin/clubs", label: "Club & teams" },
  { href: "/admin/fonts", label: "Fonts" },
  { href: "/admin/colors", label: "Huisstijlkleuren" },
  { href: "/admin/users", label: "Gebruikers" },
  { href: "/docs/psd-conventions", label: "Documentatie" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdminSection = pathname?.startsWith("/admin");
  const nav = isAdminSection ? adminNav : userNav;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <Image src="/branding/hhc-logo.png" alt="HHC Hardenberg" width={32} height={40} className="h-10 w-8" priority />
            <span className="hidden sm:inline">Design Editor</span>
          </Link>
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
          <div className="flex items-center gap-2">
            {session?.user?.role === "ADMIN" && (
              <Link
                href={isAdminSection ? "/dashboard" : "/admin/templates"}
                className="hidden text-xs font-medium text-hhc-orange-dark hover:underline sm:inline"
              >
                {isAdminSection ? "Naar app" : "Beheer"}
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
