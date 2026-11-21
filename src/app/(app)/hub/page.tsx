import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Globe, Megaphone, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { featuredModule, hubModuleGroups } from "@/lib/hub-modules";
import { NewsPosts } from "@/components/news-posts";
import { SocialIcon } from "@/components/social-icons";
import { getMergedAgendaEvents } from "@/lib/agenda";
import { isNewsEnabled, listNewsPosts } from "@/lib/news.server";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-channels";
import { listSocialChannels } from "@/lib/social-channels.server";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ModuleIndex } from "@/components/module-index";
import { MatchBand } from "@/components/dashboard/match-band";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { formatDay } from "@/lib/date-format";
import { cn } from "@/lib/utils";

const TZ = "Europe/Amsterdam";
// Matchday-templates die bij de eerstvolgende wedstrijd als snelle actie verschijnen.
const MATCHDAY_SLUGS = ["matchday", "opstelling", "eindstand", "social-media-story"];

function amsterdam(d: Date, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, ...opts }).format(d);
}

function greeting(now: Date) {
  const h = Number(amsterdam(now, { hour: "2-digit", hourCycle: "h23" }));
  return h < 6 ? "Goedenacht" : h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
}

export default async function HubPage() {
  const now = new Date();
  const startOfToday = new Date(now.getTime() - 2 * 3600_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);

  const session = await auth();
  const userId = session!.user.id;
  const [agenda, newsEnabled, socialChannels, nextMatchRow, matches30, designsWeek, myDesigns, templateCount, matchdayTemplates, recentDesigns] = await Promise.all([
    getMergedAgendaEvents({ limit: 5 }),
    isNewsEnabled("hub"),
    listSocialChannels(),
    prisma.match.findFirst({ where: { date: { gte: startOfToday }, status: { not: "CANCELLED" } }, orderBy: { date: "asc" }, include: { team: true, opponent: true } }),
    prisma.match.count({ where: { date: { gte: startOfToday, lte: in30 }, status: { not: "CANCELLED" } } }),
    prisma.generatedDesign.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.generatedDesign.count({ where: { userId } }),
    prisma.template.count({ where: { status: "PUBLISHED", activeVersionId: { not: null } } }),
    prisma.template.findMany({ where: { status: "PUBLISHED", activeVersionId: { not: null }, slug: { in: MATCHDAY_SLUGS } }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
    prisma.generatedDesign.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 4, include: { templateVersion: { include: { template: true } } } }),
  ]);
  const newsPosts = newsEnabled ? await listNewsPosts("hub", 3) : [];

  const nextMatch = nextMatchRow
    ? {
        id: nextMatchRow.id,
        home: nextMatchRow.isHome ? (nextMatchRow.team.shortName ?? nextMatchRow.team.name) : (nextMatchRow.opponent.shortName ?? nextMatchRow.opponent.name),
        away: nextMatchRow.isHome ? (nextMatchRow.opponent.shortName ?? nextMatchRow.opponent.name) : (nextMatchRow.team.shortName ?? nextMatchRow.team.name),
        isHome: nextMatchRow.isHome,
        date: nextMatchRow.date.toISOString(),
        competition: nextMatchRow.competition,
      }
    : null;
  const matchActions = nextMatch
    ? [
        ...matchdayTemplates.map((t) => ({ label: t.name, href: `/templates/${t.slug}/create?matchId=${nextMatch.id}` })),
        ...(matchdayTemplates.length < 3 ? [{ label: "Alle templates", href: "/templates" }] : []),
      ]
    : [];

  const firstName = session?.user?.name?.split(" ")[0];
  const weekday = amsterdam(now, { weekday: "long" });
  const moduleItems = [featuredModule, ...hubModuleGroups.flatMap((g) => g.modules)]
    .filter((m) => m.id !== "nieuws" || newsEnabled)
    .map((m) => ({ key: m.id, title: m.title, description: m.description, href: m.href, icon: m.icon, status: m.status }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`${weekday} ${formatDay(now)}`}
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ""}`}
        description="Alles om content voor HHC Hardenberg te maken: afbeeldingen, persberichten, nieuws en de agenda."
        actions={
          <>
            <Link href="/persberichten" className={buttonVariants({ variant: "outline" })}>
              <Megaphone className="h-4 w-4" /> Persbericht
            </Link>
            <Link href="/templates" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> Nieuwe afbeelding
            </Link>
          </>
        }
      />

      <MatchBand match={nextMatch} actions={matchActions} emptyHref="/kalender" />

      <StatStrip
        items={[
          { label: "Wedstrijden komende 30 dagen", value: matches30, hint: "met snelle matchday-acties", href: "/dashboard" },
          { label: "Ontwerpen deze week", value: designsWeek, hint: "door het hele team" },
          { label: "Mijn ontwerpen", value: myDesigns, hint: "concepten en voltooid", href: "/designs" },
          { label: "Templates beschikbaar", value: templateCount, hint: "klaar om te gebruiken", href: "/templates" },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr]">
        <section className="min-w-0">
          <SectionHeader title="Agenda" action={<Link href="/kalender" className="font-semibold text-hhc-orange-dark hover:underline">Volledige agenda</Link>} />
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {agenda.events.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {agenda.icsError ? "De agenda kon even niet worden geladen. Probeer het later opnieuw." : "Er staan geen activiteiten gepland."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {agenda.events.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                    <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-lg border py-1.5", e.highlighted ? "border-secondary bg-secondary text-white" : "border-border")}>
                      <span className={cn("eyebrow text-[0.5625rem]", e.highlighted ? "text-hhc-orange" : "text-muted-foreground")}>{amsterdam(e.start, { weekday: "short" }).replace(".", "")}</span>
                      <span className="stat-number text-xl">{amsterdam(e.start, { day: "2-digit" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDay(e.start)}
                        {!e.isFullDay && ` · ${amsterdam(e.start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`}
                        {e.location && ` · ${e.location}`}
                      </p>
                    </div>
                    {e.highlighted && <span className="hidden rounded-full bg-hhc-orange-soft px-2 py-0.5 text-xs font-semibold text-hhc-orange-dark sm:inline">Uitgelicht</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="min-w-0">
          <SectionHeader title="Snelle links" />
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <ul className="divide-y divide-border">
              {[
                { title: featuredModule.title, description: "Clubafbeeldingen maken op basis van templates", href: featuredModule.href, icon: featuredModule.icon },
                { title: "Crisiscommunicatie", description: "Wie bellen, wie mag communiceren", href: "/crisis", icon: AlertTriangle },
                { title: "HHC CMS", description: "Website van HHC beheren", href: "https://hhc.nl/cms", icon: Globe, external: true },
              ].map((l) => {
                const body = (
                  <>
                    <span className="icon-tile">
                      <l.icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.85} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{l.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">{l.description}</span>
                    </span>
                    {l.external && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="opent in nieuw tabblad" />}
                  </>
                );
                const cls = "group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-[#fafaf8] sm:px-5";
                return (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
                    ) : (
                      <Link href={l.href} className={cls}>{body}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
            {socialChannels.length > 0 && (
              <div className="border-t border-border bg-[#fafaf8] px-4 py-3.5 sm:px-5">
                <p className="eyebrow mb-2.5 text-muted-foreground">Kanalen van HHC</p>
                <div className="flex flex-wrap gap-2">
                  {socialChannels.map((channel) => (
                    <a
                      key={channel.platform}
                      href={channel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-foreground hover:bg-secondary hover:text-white"
                    >
                      <SocialIcon platform={channel.platform} className="h-4 w-4" />
                      {SOCIAL_PLATFORM_LABELS[channel.platform]}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <SectionHeader className="mt-8" title="Mijn recente ontwerpen" action={<Link href="/designs" className="font-semibold text-hhc-orange-dark hover:underline">Alles bekijken</Link>} />
          {recentDesigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-5 py-6 text-sm text-muted-foreground">
              Je hebt nog geen ontwerpen gemaakt.{" "}
              <Link href="/templates" className="font-semibold text-hhc-orange-dark hover:underline">Maak je eerste afbeelding</Link>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {recentDesigns.map((d) => (
                <Link key={d.id} href={`/templates/${d.templateVersion.template.slug}/create?designId=${d.id}`} className="group" title={d.title ?? d.templateVersion.template.name}>
                  <div
                    className="aspect-[4/5] rounded-lg border border-border bg-surface-muted bg-cover bg-center transition-[border-color] group-hover:border-foreground/40"
                    style={d.exportUrl ? { backgroundImage: `url(${d.exportUrl})` } : undefined}
                  />
                  <p className="mt-1.5 truncate text-xs font-medium">{d.title ?? d.templateVersion.template.name}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {newsPosts.length > 0 && (
        <section>
          <SectionHeader title="Nieuws" action={<Link href="/nieuws" className="font-semibold text-hhc-orange-dark hover:underline">Alle berichten</Link>} />
          <NewsPosts variant="dashboard" posts={newsPosts} />
        </section>
      )}

      <section>
        <SectionHeader title="Alle onderdelen" />
        <ModuleIndex items={moduleItems} />
      </section>
    </div>
  );
}
