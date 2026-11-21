import Link from "next/link";
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModuleIndexItem {
  key: string;
  title: string;
  description?: string;
  href: string;
  icon?: LucideIcon;
  status?: "available" | "soon";
  external?: boolean;
}

/**
 * Overzicht van onderdelen als één paneel met rijen (geen losse zwevende
 * tegels): rustiger, beter scanbaar, en schaalt van 2 tot 20 onderdelen.
 */
export function ModuleIndex({ items, columns = 3, className }: { items: ModuleIndexItem[]; columns?: 2 | 3; className?: string }) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-xl border border-border bg-border gap-px",
        columns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {items.map((m) => {
        const Icon = m.icon;
        const soon = m.status === "soon";
        const body = (
          <>
            {Icon && (
              <span className="icon-tile mt-0.5">
                <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.85} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-semibold leading-snug">{m.title}</span>
                {soon && <span className="rounded border border-border-strong px-1.5 text-[10px] font-medium text-muted-foreground">Binnenkort</span>}
              </span>
              {m.description && <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{m.description}</span>}
            </span>
            {!soon &&
              (m.external ? (
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-label="opent in nieuw tabblad" />
              ) : (
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-border-strong transition-all group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
              ))}
          </>
        );
        const cls = "group flex items-start gap-3.5 bg-surface p-4 transition-colors sm:p-5";
        if (soon) return <div key={m.key} className={cn(cls, "opacity-60")}>{body}</div>;
        return m.external ? (
          <a key={m.key} href={m.href} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:bg-[#fafaf8]")}>{body}</a>
        ) : (
          <Link key={m.key} href={m.href} className={cn(cls, "hover:bg-[#fafaf8]")}>{body}</Link>
        );
      })}
      {/* Vul de laatste rij op, zodat er geen grijze gaten in het raster vallen. */}
      {columns === 3 &&
        Array.from({ length: (3 - (items.length % 3)) % 3 }).map((_, i) => <div key={`f3-${i}`} className="hidden bg-surface xl:block" aria-hidden />)}
      {items.length % 2 === 1 && <div className={cn("hidden bg-surface sm:block", columns === 3 && "xl:hidden")} aria-hidden />}
    </div>
  );
}
