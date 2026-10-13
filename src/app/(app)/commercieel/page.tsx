import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { loadDashboard } from "@/lib/commercial/dashboard.server";
import { formatDate, formatEuro } from "@/lib/commercial/client";
import { visibleNavGroups } from "@/lib/commercial/navigation";
import { NewsPosts } from "@/components/news-posts";
import { isNewsEnabled, listNewsPosts } from "@/lib/news.server";

export const metadata: Metadata = { title: "Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function CommercialHome() {
  const session = await auth();
  const access = await loadCommercialAccess(session!.user.id);
  const newsEnabled = await isNewsEnabled("commercial");
  const groups = visibleNavGroups(access.can, { news: newsEnabled });
  // Alleen onderdelen met een bevoegdheid tellen mee; het nieuws is voor elk lid.
  const hasPermissions = visibleNavGroups(access.can).length > 0;
  const [dash, newsPosts] = await Promise.all([
    hasPermissions ? buildRecordCtx(session!.user).then(loadDashboard) : null,
    newsEnabled ? listNewsPosts("commercial", 3) : [],
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Commerciële Zaken</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sponsorbeheer van HHC Hardenberg. Kies hieronder waar je mee aan de slag wilt, of gebruik het menu links.</p>
      </div>

      {dash && (
        <section aria-labelledby="dash-h">
          <h2 id="dash-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overzicht</h2>
          <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dash.tasks && (
              <Card className="flex h-full flex-col">
                <CardHeader><CardTitle className="text-base">Mijn open taken</CardTitle></CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.tasks.total}</span>{dash.overdueTasks ? <span className="ml-2 text-destructive">{dash.overdueTasks} achterstallig</span> : null}</p>
                  <ul className="divide-y divide-border">
                    {dash.tasks.rows.map((t) => <li key={t.id} className="py-1.5"><span className="font-medium">{t.title}</span><span className="block text-xs text-muted-foreground">{[t.companyName, t.dueAt && formatDate(t.dueAt)].filter(Boolean).join(" · ")}</span></li>)}
                  </ul>
                  <Link className="mt-auto pt-1 text-hhc-orange-dark underline" href="/commercieel/taken">Alle taken</Link>
                </CardContent>
              </Card>
            )}
            {dash.contracts && (
              <Card className="flex h-full flex-col">
                <CardHeader><CardTitle className="text-base">Aflopende contracten</CardTitle></CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.contracts.total}</span><span className="ml-2 text-muted-foreground">binnen 90 dagen</span></p>
                  <ul className="divide-y divide-border">
                    {dash.contracts.rows.map((c) => <li key={c.id} className="py-1.5"><Link className="font-medium underline" href={`/commercieel/sponsoren/${c.companyId}`}>{c.companyName}</Link><span className="block text-xs text-muted-foreground">{c.seasonName} · einde {formatDate(c.endsOn)}{c.noticeUntil ? ` · opzeggen vóór ${formatDate(c.noticeUntil)}` : ""}</span></li>)}
                  </ul>
                  <Link className="mt-auto pt-1 text-hhc-orange-dark underline" href="/commercieel/contracten">Alle contracten</Link>
                </CardContent>
              </Card>
            )}
            {dash.invoices && (
              <Card className="flex h-full flex-col">
                <CardHeader><CardTitle className="text-base">Openstaande facturen</CardTitle></CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.invoices.count}</span>{dash.invoices.outstandingCents != null ? <span className="ml-2 text-muted-foreground">{formatEuro(dash.invoices.outstandingCents)} te ontvangen</span> : null}</p>
                  <Link className="mt-auto pt-1 text-hhc-orange-dark underline" href="/commercieel/facturen">Naar facturen</Link>
                </CardContent>
              </Card>
            )}
            {dash.pipeline && (
              <Card className="flex h-full flex-col">
                <CardHeader><CardTitle className="text-base">Pijplijn</CardTitle></CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.pipeline.count}</span><span className="ml-2 text-muted-foreground">open kansen</span></p>
                  <Link className="mt-auto pt-1 text-hhc-orange-dark underline" href="/commercieel/pijplijn">Naar de pijplijn</Link>
                </CardContent>
              </Card>
            )}
            {dash.contactGaps && (
              <Card className="flex h-full flex-col">
                <CardHeader><CardTitle className="text-base">Contactmoment nodig</CardTitle></CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.contactGaps.total}</span><span className="ml-2 text-muted-foreground">van jouw sponsoren al lang niet gesproken</span></p>
                  <ul className="divide-y divide-border">
                    {dash.contactGaps.rows.map((g) => <li key={g.companyId} className="py-1.5"><Link className="font-medium underline" href={`/commercieel/sponsoren/${g.companyId}`}>{g.companyName}</Link><span className="block text-xs text-muted-foreground">{g.lastContactOn ? `laatst gesproken ${formatDate(g.lastContactOn)} (${g.daysSince} dagen)` : "nog geen contactmoment vastgelegd"}</span></li>)}
                  </ul>
                  <Link className="mt-auto pt-1 text-hhc-orange-dark underline" href="/commercieel/contactmomenten">Alle contactmomenten</Link>
                </CardContent>
              </Card>
            )}
            {dash.counterparts && (
              <Card className="flex h-full flex-col">
                <CardHeader><CardTitle className="text-base">Tegenprestaties</CardTitle></CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.counterparts.open}</span><span className="ml-2 text-muted-foreground">te leveren</span>{dash.counterparts.overdue > 0 ? <span className="ml-2 text-destructive">{dash.counterparts.overdue} te laat</span> : null}</p>
                  <Link className="mt-auto pt-1 text-hhc-orange-dark underline" href="/commercieel/tegenprestaties">Naar de planning</Link>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {newsPosts.length > 0 && (
        <section aria-labelledby="news-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="news-h" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nieuws</h2>
            <Link className="text-sm text-hhc-orange-dark underline" href="/commercieel/nieuws">Alle berichten</Link>
          </div>
          <NewsPosts variant="dashboard" posts={newsPosts} />
        </section>
      )}

      {!hasPermissions ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Je hebt toegang tot de sectie, maar nog geen bevoegdheden voor onderdelen. Vraag een beheerder om een rol.
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`grp-${g.id}`}>
            <h2 id={`grp-${g.id}`} className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-hhc-orange-dark">
              <span aria-hidden className="h-2 w-2 rounded-full bg-hhc-orange" />
              {g.label}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="block h-full rounded-lg border border-l-4 border-border border-l-hhc-orange bg-surface p-4 shadow-sm transition-colors hover:bg-surface-muted">
                    <span className="font-semibold">{i.label}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{i.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
