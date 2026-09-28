import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ticketingModules, ticketingQuickLinks } from "@/lib/ticketing-modules";

export const metadata: Metadata = { title: "Ticketing" };

export default function TicketingPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl bg-hhc-black p-8 text-hhc-white">
        <h1 className="text-2xl font-bold">Ticketing</h1>
        <p className="mt-1 text-white/70">
          Handleidingen, procedures en belangrijke informatie over het ticketingsysteem.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Snelle links</h2>
        <Card>
          <CardContent className="grid divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {ticketingQuickLinks.map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-muted"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-hhc-orange-dark">
                  <link.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{link.title}</p>
                  <p className="text-sm text-muted-foreground">{link.description}</p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ticketingModules.map((mod) => {
          const Icon = mod.icon;
          const card = (
            <Card className={mod.status === "available" ? "h-full transition-all hover:-translate-y-0.5 hover:shadow-md" : "h-full opacity-60"}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-hhc-orange-dark">
                    <Icon className="h-5 w-5" />
                  </div>
                  {mod.status === "soon" && <Badge variant="outline">Binnenkort</Badge>}
                </div>
                <CardTitle className="mt-1">{mod.title}</CardTitle>
                <CardDescription>{mod.description}</CardDescription>
              </CardHeader>
            </Card>
          );

          return mod.status === "available" ? (
            <Link key={mod.id} href={mod.href}>
              {card}
            </Link>
          ) : (
            <div key={mod.id} className="cursor-not-allowed">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
