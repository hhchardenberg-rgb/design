import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DesignDeleteButton } from "@/components/design-delete-button";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";

const QUICK_ACTION_SLUGS = ["matchday", "opstelling", "eindstand", "social-media-story"];

export const metadata: Metadata = { title: "Designtool" };

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [upcomingMatches, recentDesigns, templates] = await Promise.all([
    prisma.match.findMany({
      where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      orderBy: { date: "asc" },
      take: 3,
      include: { team: true, opponent: true },
    }),
    prisma.generatedDesign.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { templateVersion: { include: { template: true } } },
    }),
    prisma.template.findMany({
      where: { status: "PUBLISHED", activeVersionId: { not: null } },
      orderBy: [{ sortOrder: "asc" }],
      take: 6,
    }),
  ]);

  const quickActionTemplates = templates.filter((t) => QUICK_ACTION_SLUGS.includes(t.slug));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Communicatie"
        title="Designtool"
        description="Maak in een paar klikken een professionele clubafbeelding."
        actions={
          <Link href="/templates">
            <Button>Nieuwe afbeelding maken</Button>
          </Link>
        }
      />

      {upcomingMatches.length > 0 && (
        <section>
          <SectionHeader title="Aankomende wedstrijden" />
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {upcomingMatches.map((match) => (
              <li key={match.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="eyebrow text-muted-foreground">
                    {match.competition ?? "Wedstrijd"} · {match.isHome ? "Thuis" : "Uit"}
                  </p>
                  <p className="mt-1 font-heading text-lg font-bold">
                    {match.isHome ? match.team.shortName ?? match.team.name : match.opponent.shortName ?? match.opponent.name}
                    {" – "}
                    {match.isHome ? match.opponent.shortName ?? match.opponent.name : match.team.shortName ?? match.team.name}
                  </p>
                  <p className="tabular text-sm text-muted-foreground">
                    {format(match.date, "EEEE dd/MM/yyyy, HH:mm", { locale: nl })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickActionTemplates.length > 0
                    ? quickActionTemplates.map((t) => (
                        <Link key={t.id} href={`/templates/${t.slug}/create?matchId=${match.id}`}>
                          <Button size="sm" variant="outline">
                            {t.name}
                          </Button>
                        </Link>
                      ))
                    : (
                      <Link href="/templates">
                        <Button size="sm" variant="outline">Maak afbeelding</Button>
                      </Link>
                    )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionHeader title="Favoriete templates" action={<Link href="/templates" className="font-semibold text-hhc-orange-dark hover:underline">Alle templates</Link>} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {templates.map((t) => (
            <Link key={t.id} href={`/templates/${t.slug}/create`}>
              <Card className="group overflow-hidden transition-colors hover:border-border-strong">
                <div className="aspect-[4/5] bg-surface-muted bg-cover bg-center" style={t.thumbnailUrl ? { backgroundImage: `url(${t.thumbnailUrl})` } : undefined} />
                <CardContent className="p-3">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Recente ontwerpen" action={<Link href="/designs" className="font-semibold text-hhc-orange-dark hover:underline">Alles bekijken</Link>} />
        {recentDesigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Je hebt nog geen ontwerpen gemaakt.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {recentDesigns.map((d) => (
              <div key={d.id} className="relative">
                <DesignDeleteButton designId={d.id} />
                <Link href={`/templates/${d.templateVersion.template.slug}/create?designId=${d.id}`}>
                  <Card className="overflow-hidden transition-colors hover:border-border-strong">
                    <div
                      className="aspect-[4/5] bg-surface-muted bg-cover bg-center"
                      style={d.exportUrl ? { backgroundImage: `url(${d.exportUrl})` } : undefined}
                    />
                    <CardContent className="p-3">
                      <p className="truncate text-sm font-medium">{d.title ?? d.templateVersion.template.name}</p>
                      <Badge variant={d.status === "COMPLETED" ? "success" : "outline"} className="mt-1">
                        {d.status === "COMPLETED" ? "Voltooid" : "Concept"}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
