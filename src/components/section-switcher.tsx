"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface SectionLink {
  key: string;
  label: string;
  href: string;
}

/**
 * Wisselen tussen de top-level secties (Communicatie, Ticketing, Beheer,
 * Accountbeveiliging). Vanaf `lg` als losse knoppen naast elkaar; op
 * smallere schermen als één dropdown, zodat je niet hoeft te swipen.
 */
export function SectionSwitcher({ items, activeKey }: { items: SectionLink[]; activeKey: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = items.find((s) => s.key === activeKey);

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

  return (
    <>
      <div className="hidden items-center gap-1.5 lg:flex">
        {items.map((s) => (
          <Link key={s.key} href={s.href} className="shrink-0">
            <Button variant={activeKey === s.key ? "primary" : "outline"} size="sm" className="whitespace-nowrap">
              {s.label}
            </Button>
          </Link>
        ))}
      </div>

      <div ref={ref} className="relative min-w-0 lg:hidden">
        <Button
          variant={active ? "primary" : "outline"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="max-w-full gap-1"
        >
          <span className="truncate">{active?.label ?? "Menu"}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
        </Button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface p-2 shadow-lg"
          >
            {items.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-muted",
                  activeKey === s.key && "font-semibold text-hhc-orange-dark"
                )}
              >
                <span className="flex-1">{s.label}</span>
                {activeKey === s.key && <Check className="h-4 w-4 shrink-0" />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
