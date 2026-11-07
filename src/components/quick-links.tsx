import Link from "next/link";
import { ArrowRight, ExternalLink, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface QuickLink {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Externe link: opent in een nieuw tabblad. Interne links openen gewoon in de Hub. */
  external?: boolean;
}

// Vaste klassen (Tailwind kan geen samengestelde klassennamen vinden).
const columns: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

const itemClass = "flex items-center gap-3 p-4 transition-colors hover:bg-surface-muted";

/** De "Snelle links"-balk bovenaan een startpagina (Ticketing, Communicatie). */
export function QuickLinks({ links, children }: { links: QuickLink[]; children?: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Snelle links</h2>
      <Card>
        <CardContent className={`grid divide-y divide-border p-0 sm:divide-x sm:divide-y-0 ${columns[Math.min(links.length, 3)] ?? "sm:grid-cols-3"}`}>
          {links.map((link) => {
            const content = (
              <>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-hhc-orange-dark">
                  <link.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{link.title}</p>
                  <p className="text-sm text-muted-foreground">{link.description}</p>
                </div>
                {link.external ? (
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </>
            );
            return link.external ? (
              <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer" className={itemClass}>
                {content}
              </a>
            ) : (
              <Link key={link.id} href={link.href} className={itemClass}>
                {content}
              </Link>
            );
          })}
        </CardContent>
        {children}
      </Card>
    </section>
  );
}
