import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/commercial/no-access";
import { prisma } from "@/lib/prisma";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { SEASON_PHASE_LABEL, seasonPhase } from "@/lib/commercial/season-phase";
import { formatDay } from "@/lib/date-format";

export const metadata: Metadata = { title: "Seizoenskaarten – HHC Tickets" };
export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function SeasonCardsPage() {
  const a = await ticketsPageAccess("types:read");
  if (!a.allowed) return <NoAccess what="seizoenskaarten" />;
  const now = new Date();
  const [types, counts, reentryEvents] = await Promise.all([
    prisma.ticketType.findMany({ where: { isSeasonCard: true }, orderBy: { name: "asc" }, include: { season: true, zone: { select: { name: true } } } }),
    prisma.ticket.groupBy({ by: ["typeId"], where: { isSeasonCard: true, status: "ACTIVE", OR: [{ validUntil: null }, { validUntil: { gte: now } }] }, _count: { _all: true } }),
    prisma.ticketEvent.count({ where: { allowReentry: true, endsAt: { gte: now } } }),
  ]);
  const count = new Map(counts.map((c) => [c.typeId, c._count._all]));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seizoenskaarten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Interne seizoenskaarten gelden voor een seizoen, eventueel beperkt tot thuiswedstrijden, competities en een vak. Alleen seizoenskaarten kunnen opnieuw naar binnen, en alleen bij wedstrijden waar herintrede aan staat ({reentryEvents} komende).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Soorten seizoenskaart</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {types.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nog geen seizoenskaarten. Maak een tickettype met categorie &quot;Interne seizoenskaart&quot; aan onder Tickettypes en vakken.</p>
          ) : (
            <ul className="divide-y divide-border">
              {types.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.season ? `${SEASON_PHASE_LABEL[seasonPhase({ startsOn: iso(t.season.startsOn), endsOn: iso(t.season.endsOn) })]} (${formatDay(iso(t.season.startsOn))} t/m ${formatDay(iso(t.season.endsOn))})` : "Seizoen kiezen bij uitgifte"}
                      {t.homeOnly ? " · thuiswedstrijden" : " · alle wedstrijden"}
                      {t.competitions.length ? ` · ${t.competitions.join(", ")}` : ""}
                      {t.zone ? ` · vak ${t.zone.name}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{count.get(t.id) ?? 0} geldig</span>
                  {a.can("tickets:issue") && t.active && (
                    <Link href={`/tickets/uitgeven?type=${t.id}`} className="text-sm font-semibold text-hhc-orange-dark hover:underline">
                      Uitgeven
                    </Link>
                  )}
                  {a.can("tickets:read") && (
                    <Link href="/tickets/overzicht?categorie=SEASON" className="text-sm text-muted-foreground hover:underline">
                      Overzicht
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
