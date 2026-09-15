"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { hubModules } from "@/lib/hub-modules";

// Snel-schakelmenu ("waffle") tussen de onderdelen van de hub, overal
// bereikbaar vanuit de header — ook vanuit beheer — zodat je niet eerst
// terug naar /hub hoeft om van app te wisselen.
export function HubAppsMenu() {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Onderdelen van de hub"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
          open && "bg-surface-muted text-foreground"
        )}
      >
        <LayoutGrid className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-border bg-surface p-2 shadow-lg sm:w-80">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Onderdelen van de hub</p>
          <div className="grid grid-cols-2 gap-1">
            {hubModules.map((mod) =>
              mod.status === "available" ? (
                <Link
                  key={mod.id}
                  href={mod.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-0.5 rounded-md p-2.5 text-left transition-colors hover:bg-surface-muted"
                >
                  <span className="text-sm font-medium">{mod.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{mod.description}</span>
                </Link>
              ) : (
                <div key={mod.id} className="flex flex-col gap-0.5 rounded-md p-2.5 text-left opacity-50">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {mod.title}
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      Binnenkort
                    </Badge>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{mod.description}</span>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
