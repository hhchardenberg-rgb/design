"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface NavMenuItem {
  title: string;
  description?: string;
  href: string;
  status?: "available" | "soon";
  icon?: LucideIcon;
}

export interface NavMenuGroup {
  id: string;
  label: string;
  items: NavMenuItem[];
}

/**
 * Compact, gegroepeerd dropdownmenu — gebruikt voor zowel het wisselen
 * tussen hub-onderdelen (vanaf elke pagina) als de beheerpagina's binnen
 * /admin. Eén kolom met korte groepskopjes in plaats van een brede
 * kaartengrid, zodat het menu ook met veel onderdelen (10+) overzichtelijk
 * blijft en zelden hoeft te scrollen.
 */
export function GroupedNavMenu({
  groups,
  featured,
  label = "Onderdelen",
}: {
  groups: NavMenuGroup[];
  featured?: NavMenuItem;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function renderItem(item: NavMenuItem, emphasized = false) {
    const disabled = item.status === "soon";
    const Icon = item.icon;
    const row = (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
          disabled ? "opacity-50" : "hover:bg-surface-muted",
          emphasized && "font-semibold"
        )}
      >
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", emphasized ? "text-hhc-orange-dark" : "text-muted-foreground")} />}
        <span className="flex-1">{item.title}</span>
        {disabled && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            Binnenkort
          </Badge>
        )}
      </div>
    );
    return disabled ? (
      <div key={item.href}>{row}</div>
    ) : (
      <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
        {row}
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground sm:px-3",
          open && "bg-surface-muted text-foreground"
        )}
      >
        <LayoutGrid className="h-5 w-5" />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 flex max-h-[75vh] w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-lg">
          {featured && (
            <>
              {renderItem(featured, true)}
              <div className="my-1 border-t border-border" />
            </>
          )}
          {groups.map((group, i) => (
            <div key={group.id}>
              {i > 0 && <div className="my-1 border-t border-border" />}
              <p className="px-3 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">{group.label}</p>
              {group.items.map((item) => renderItem(item))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
