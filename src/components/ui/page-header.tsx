import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Vaste paginakop van de Hub: klein label (onderdeel of datum), titel in DIN,
 * één zin uitleg en acties rechts, met een haarlijn eronder. Zo voelt elke
 * pagina als hetzelfde product.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-hhc-orange-dark">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.9375rem] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Kop boven een blok op een pagina: titel links, optionele link of actie rechts. */
export function SectionHeader({ title, action, className }: { title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="text-[1.0625rem] font-bold leading-tight">{title}</h2>
      {action && <div className="shrink-0 text-sm">{action}</div>}
    </div>
  );
}
