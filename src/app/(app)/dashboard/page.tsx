import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DesignDeleteButton } from "@/components/design-delete-button";

const QUICK_ACTION_SLUGS = ["matchday", "opstelling", "eindstand", "social-media-story"];

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
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-4 rounded-xl bg-hhc-black p-8 text-hhc-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welkom terug{session?.user?.name ? `, ${session.user.name}` : ""}</h1>
          <p className="mt-1 text-white/70">Maak in een paar klikken een professionele clubafbeelding.</p>
        </div>
        <Link href="/templates">
          <Button size="lg">Nieuwe afbeelding maken</Button>
        </Link>
      </section>

      {upcomingMatches.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Aankomende wedstrijden</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingMatches.map((match) => (
              <Card key={match.id}>
                <CardHeader>
                  <Badge variant="primary" className="w-fit">
                    {match.competition ?? "Wedstrijd"}
                  </Badge>
                  <CardTitle className="mt-2">
                    {match.isHome ? match.team.shortName ?? match.team.name : match.opponent.shortName ?? match.opponent.name}
                    {" – "}
                    {match.isHome ? match.opponent.shortName ?? match.opponent.name : match.team.shortName ?? match.team.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {format(match.date, "EEEE d MMMM, HH:mm", { locale: nl })}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
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
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Favoriete templates</h2>
          <Link href="/templates" className="text-sm font-medium text-hhc-orange-dark hover:underline">
            Alle templates
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {templates.map((t) => (
            <Link key={t.id} href={`/templates/${t.slug}/create`}>
              <Card className="group overflow-hidden transition-shadow hover:shadow-md">
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recente ontwerpen</h2>
          <Link href="/designs" className="text-sm font-medium text-hhc-orange-dark hover:underline">
            Alles bekijken
          </Link>
        </div>
        {recentDesigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Je hebt nog geen ontwerpen gemaakt.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {recentDesigns.map((d) => (
              <div key={d.id} className="relative">
                <DesignDeleteButton designId={d.id} />
                <Link href={`/templates/${d.templateVersion.template.slug}/create?designId=${d.id}`}>
                  <Card className="overflow-hidden transition-shadow hover:shadow-md">
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
