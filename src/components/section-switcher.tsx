"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Grip, LogOut, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SectionLink {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
}

/**
 * Eén "Apps"-knop om te wisselen tussen de onderdelen van de Hub
 * (Communicatie, Ticketing, Commerciële Zaken, Beheer), als tegels — alsof
 * het losse applicaties zijn. Onderin staan Profiel en Uitloggen, zodat de
 * kopregel op elk scherm rustig blijft en er nooit geswiped hoeft te worden.
 */
export function SectionSwitcher({
  apps,
  activeKey,
  accountHref,
  onSignOut,
}: {
  apps: SectionLink[];
  activeKey: string | null;
  accountHref: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = apps.find((s) => s.key === activeKey);
  const buttonLabel = active?.label ?? (activeKey === "account" ? "Profiel" : "Apps");

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
    <div ref={ref} className="min-w-0 md:relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Apps"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex h-9 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium transition-colors hover:bg-surface-muted sm:px-3",
          open && "bg-surface-muted"
        )}
      >
        <Grip className="h-4 w-4 shrink-0 text-hhc-orange-dark" />
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute inset-x-3 top-full z-30 mt-1 rounded-lg border border-border bg-surface p-2 shadow-lg md:inset-x-auto md:right-0 md:mt-2 md:w-80"
        >
          {apps.length > 0 && (
            <>
              <p className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">Apps</p>
              <div className="grid grid-cols-2 gap-2">
                {apps.map((s) => {
                  const Icon = s.icon ?? Grip;
                  const isActive = activeKey === s.key;
                  return (
                    <Link
                      key={s.key}
                      href={s.href}
                      role="menuitem"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-center text-sm font-medium transition-colors hover:bg-surface-muted",
                        isActive ? "border-transparent bg-surface-muted" : "border-border"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full",
                          isActive ? "bg-hhc-orange text-white" : "bg-surface-muted text-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="leading-tight">{s.label}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="my-2 border-t border-border" />
            </>
          )}
          <Link
            href={accountHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-muted",
              activeKey === "account" && "font-semibold"
            )}
          >
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            Profiel
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted"
          >
            <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
            Uitloggen
          </button>
        </div>
      )}
    </div>
  );
}
