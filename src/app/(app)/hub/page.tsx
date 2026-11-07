import Link from "next/link";
import { AlertTriangle, Globe } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { featuredModule, hubModuleGroups } from "@/lib/hub-modules";
import { AgendaEventCard } from "@/components/agenda-event-card";
import { NewsPosts } from "@/components/news-posts";
import { QuickLinks, type QuickLink } from "@/components/quick-links";
import { SocialIcon } from "@/components/social-icons";
import { getMergedAgendaEvents } from "@/lib/agenda";
import { isNewsEnabled, listNewsPosts } from "@/lib/news.server";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-channels";
import { listSocialChannels } from "@/lib/social-channels.server";

export const revalidate = 900;

const quickLinks: QuickLink[] = [
  {
    id: featuredModule.id,
    title: featuredModule.title,
    description: "Clubafbeeldingen maken op basis van templates",
    href: featuredModule.href,
    icon: featuredModule.icon,
  },
  {
    id: "crisis",
    title: "Crisiscommunicatie",
    description: "Wie bellen, wie mag communiceren",
    href: "/crisis",
    icon: AlertTriangle,
  },
  {
    id: "cms",
    title: "HHC CMS",
    description: "Website van HHC beheren",
    href: "https://hhc.nl/cms",
    icon: Globe,
    external: true,
  },
];

export default async function HubPage() {
  const [session, { events: highlightedEvents }, newsEnabled, socialChannels] = await Promise.all([
    auth(),
    getMergedAgendaEvents({ onlyHighlighted: true, limit: 4 }),
    isNewsEnabled("hub"),
    listSocialChannels(),
  ]);
  const newsPosts = newsEnabled ? await listNewsPosts("hub", 3) : [];
  // Crisiscommunicatie staat al bij de snelle links bovenaan, dus de
  // "crisis"-groep niet nogmaals tonen tussen de gewone onderdelen-secties.
  // Staat het nieuws uit, dan verdwijnt ook de Nieuws-tegel.
  const moduleGroups = hubModuleGroups
    .filter((g) => g.id !== "crisis")
    .map((g) => ({ ...g, modules: g.modules.filter((m) => m.id !== "nieuws" || newsEnabled) }));

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl bg-hhc-black p-8 text-hhc-white">
        <h1 className="text-2xl font-bold">HHC Hardenberg Hub</h1>
        <p className="mt-1 text-white/70">
          Welkom{session?.user?.name ? `, ${session.user.name}` : ""}. Dé plek waar vrijwilligers van Team
          Communicatie alles vinden om content voor HHC Hardenberg te maken.
        </p>
      </section>

      <QuickLinks links={quickLinks}>
        {socialChannels.length > 0 && (
          <div className="border-t border-border p-4">
            <div className="flex flex-wrap gap-2">
              {socialChannels.map((channel) => (
                <a
                  key={channel.platform}
                  href={channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-hhc-orange hover:text-hhc-orange-dark"
                >
                  <SocialIcon platform={channel.platform} className="h-4 w-4" />
                  {SOCIAL_PLATFORM_LABELS[channel.platform]}
                </a>
              ))}
            </div>
          </div>
        )}
      </QuickLinks>

      {highlightedEvents.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Uitgelichte events</h2>
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
          <NewsPosts variant="dashboard" posts={newsPosts} />
        </section>
      )}

      {moduleGroups.map((group) => (
        <section key={group.id}>
          <h2 className="mb-3 text-lg font-semibold">{group.label}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.modules.map((mod) => {
              const Icon = mod.icon;
              const card = (
                <Card
                  className={
                    mod.status === "available"
                      ? "h-full transition-all hover:-translate-y-0.5 hover:shadow-md"
                      : "h-full opacity-60"
                  }
                >
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
        </section>
      ))}
    </div>
  );
}
