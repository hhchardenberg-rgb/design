import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pin } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hubModules } from "@/lib/hub-modules";
import { AgendaEventCard } from "@/components/agenda-event-card";
import { getMergedAgendaEvents } from "@/lib/agenda";

export const revalidate = 900;

export default async function HubPage() {
  const [session, { events: highlightedEvents }, newsPosts] = await Promise.all([
    auth(),
    getMergedAgendaEvents({ onlyHighlighted: true, limit: 4 }),
    prisma.newsPost.findMany({ orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 3 }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl bg-hhc-black p-8 text-hhc-white">
        <h1 className="text-2xl font-bold">HHC Hardenberg Hub</h1>
        <p className="mt-1 text-white/70">
          Welkom{session?.user?.name ? `, ${session.user.name}` : ""}. Dé plek waar vrijwilligers van Team
          Communicatie alles vinden om content voor HHC Hardenberg te maken.
        </p>
      </section>

      {highlightedEvents.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Aankomende events</h2>
            <Link href="/kalender" className="text-sm font-medium text-hhc-orange-dark hover:underline">
              Volledige agenda
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {highlightedEvents.map((event) => (
              <AgendaEventCard
                key={event.id}
                showDate
                event={{
                  id: event.id,
                  title: event.title,
                  description: event.description,
                  location: event.location,
                  start: event.start.toISOString(),
                  end: event.end ? event.end.toISOString() : null,
                  isFullDay: event.isFullDay,
                  highlighted: event.highlighted,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {newsPosts.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Nieuws</h2>
            <Link href="/nieuws" className="text-sm font-medium text-hhc-orange-dark hover:underline">
              Alle berichten
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {newsPosts.map((post) => (
              <Card key={post.id} className={post.pinned ? "border-hhc-orange" : undefined}>
                <CardContent className="flex gap-3 p-4">
                  {post.imageUrl && (
                    <div className="h-16 w-16 shrink-0 rounded bg-surface-muted bg-cover bg-center" style={{ backgroundImage: `url(${post.imageUrl})` }} />
                  )}
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.pinned && (
                        <Badge variant="primary" className="flex items-center gap-1">
                          <Pin className="h-3 w-3" />
                          Vastgezet
                        </Badge>
                      )}
                      {post.category && <Badge variant="outline">{post.category}</Badge>}
                      <p className="font-medium">{post.title}</p>
                      <span className="text-xs text-muted-foreground">{format(post.createdAt, "d MMM", { locale: nl })}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{post.body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Onderdelen</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hubModules.map((mod) => {
            const card = (
              <Card
                className={
                  mod.status === "available"
                    ? "h-full transition-shadow hover:shadow-md"
                    : "h-full opacity-60"
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{mod.title}</CardTitle>
                    {mod.status === "soon" && <Badge variant="outline">Binnenkort</Badge>}
                  </div>
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
      </section>
    </div>
  );
}
