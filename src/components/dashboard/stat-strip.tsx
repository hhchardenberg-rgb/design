import Link from "next/link";
import { cn } from "@/lib/utils";

export interface StatItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** "attention" kleurt de toelichting oranje: hier ligt werk. */
  tone?: "default" | "attention" | "danger";
  href?: string;
}

/** Kerncijfers op één rij, gescheiden door haarlijnen; cijfers in DIN met gelijke breedte. */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  const cols = items.length >= 6 ? "lg:grid-cols-3 2xl:grid-cols-6" : items.length === 5 ? "lg:grid-cols-5" : items.length === 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border", cols, className)}>
      {items.map((s, i) => {
        const inner = (
          <>
            <p className="text-[0.8125rem] font-medium text-muted-foreground">{s.label}</p>
            <p className="stat-number mt-2.5 text-[2rem] sm:text-[2.25rem]">{s.value}</p>
            {s.hint && (
              <p className={cn("mt-1.5 text-xs", s.tone === "attention" ? "font-semibold text-hhc-orange-dark" : s.tone === "danger" ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {s.hint}
              </p>
            )}
          </>
        );
        const cls = cn("block bg-surface px-4 py-4 sm:px-5 sm:py-5", items.length % 2 === 1 && i === items.length - 1 && "col-span-2 lg:col-span-1");
        return s.href ? (
          <Link key={s.label} href={s.href} className={cn(cls, "transition-colors hover:bg-[#fafaf8]")}>
            {inner}
          </Link>
        ) : (
          <div key={s.label} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
