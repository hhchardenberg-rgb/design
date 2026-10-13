"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarGroup {
  id: string;
  label: string;
  items: { href: string; label: string }[];
}

/**
 * Menu van Commerciële Zaken: een vaste kolom naast de pagina op brede schermen,
 * een uitklapmenu boven de pagina op smalle schermen. De actieve pagina is gemarkeerd.
 */
export function CommercialSidebar({ groups }: { groups: SidebarGroup[] }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = groups.flatMap((g) => g.items).find((i) => isActive(i.href));

  const list = (
    <nav aria-label="Commerciële Zaken" className="space-y-4 text-sm">
      <Link
        href="/commercieel"
        onClick={() => setOpen(false)}
        className={cn("flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-surface-muted", pathname === "/commercieel" && "bg-surface-muted text-foreground")}
        aria-current={pathname === "/commercieel" ? "page" : undefined}
      >
        <Home className="h-4 w-4" /> Startpagina
      </Link>
      {groups.map((g) => (
        <div key={g.id}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(i.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                    isActive(i.href) && "bg-surface-muted font-semibold text-foreground"
                  )}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <aside className="lg:w-56 lg:shrink-0">
      <div className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium"
        >
          <span>{current?.label ?? "Startpagina"}</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && <div className="mt-2 rounded-md border border-border bg-surface p-2">{list}</div>}
      </div>
      <div className="sticky top-20 hidden lg:block">{list}</div>
    </aside>
  );
}
