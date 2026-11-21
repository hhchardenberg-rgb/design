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

const itemClass = "group flex items-center gap-3.5 p-4 transition-colors hover:bg-[#fafaf8] sm:p-5";

/** De "Snelle links"-balk bovenaan een startpagina (Klantenservice, Communicatie). */
export function QuickLinks({ links, children }: { links: QuickLink[]; children?: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[1.0625rem] font-bold leading-tight">Snelle links</h2>
      <Card>
        <CardContent className={`grid divide-y divide-border p-0 sm:divide-x sm:divide-y-0 ${columns[Math.min(links.length, 3)] ?? "sm:grid-cols-3"}`}>
          {links.map((link) => {
            const content = (
              <>
                <span className="icon-tile">
                  <link.icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.85} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{link.title}</p>
                  <p className="text-sm leading-snug text-muted-foreground">{link.description}</p>
                </div>
                {link.external ? (
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ArrowRight className="h-4 w-4 shrink-0 text-border-strong transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
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
