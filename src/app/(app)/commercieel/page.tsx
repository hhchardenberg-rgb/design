import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { loadDashboard } from "@/lib/commercial/dashboard.server";
import { formatDate, formatEuro } from "@/lib/commercial/client";
import { visibleNavGroups } from "@/lib/commercial/navigation";
import { AREAS, AREA_KEYS, levelFor } from "@/lib/commercial/permissions";

export const metadata: Metadata = { title: "Commerciële Zaken" };
export const dynamic = "force-dynamic";

const LEVEL_LABEL = { none: "Geen toegang", read: "Alleen lezen", edit: "Lezen en bewerken" } as const;

export default async function CommercialHome() {
  const session = await auth();
  const access = await loadCommercialAccess(session!.user.id);
  const groups = visibleNavGroups(access.can);
  const dash = groups.length > 0 ? await loadDashboard(await buildRecordCtx(session!.user)) : null;
  const rows = AREA_KEYS.map((key) => ({ key, ...levelFor(key, access.allowed) })).filter((r) => r.level !== "none");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Commerciële Zaken</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sponsorbeheer van HHC Hardenberg. Kies hieronder waar je mee aan de slag wilt, of gebruik het menu links.</p>
      </div>

      {dash && (
        <section aria-labelledby="dash-h">
          <h2 id="dash-h" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overzicht</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dash.tasks && (
              <Card>
                <CardHeader><CardTitle className="text-base">Mijn open taken</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.tasks.total}</span>{dash.overdueTasks ? <span className="ml-2 text-destructive">{dash.overdueTasks} achterstallig</span> : null}</p>
                  <ul className="divide-y divide-border">
                    {dash.tasks.rows.map((t) => <li key={t.id} className="py-1.5"><span className="font-medium">{t.title}</span><span className="block text-xs text-muted-foreground">{[t.companyName, t.dueAt && formatDate(t.dueAt)].filter(Boolean).join(" · ")}</span></li>)}
                  </ul>
                  <Link className="text-hhc-orange-dark underline" href="/commercieel/taken">Alle taken</Link>
                </CardContent>
              </Card>
            )}
            {dash.contracts && (
              <Card>
                <CardHeader><CardTitle className="text-base">Aflopende contracten (90 dagen)</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-2xl font-bold">{dash.contracts.total}</p>
                  <ul className="divide-y divide-border">
                    {dash.contracts.rows.map((c) => <li key={c.id} className="py-1.5"><Link className="font-medium underline" href={`/commercieel/sponsoren/${c.companyId}`}>{c.companyName}</Link><span className="block text-xs text-muted-foreground">{c.seasonName} · einde {formatDate(c.endsOn)}{c.noticeUntil ? ` · opzeggen vóór ${formatDate(c.noticeUntil)}` : ""}</span></li>)}
                  </ul>
                  <Link className="text-hhc-orange-dark underline" href="/commercieel/contracten">Alle contracten</Link>
                </CardContent>
              </Card>
            )}
            {dash.invoices && (
              <Card>
                <CardHeader><CardTitle className="text-base">Openstaande facturen</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.invoices.count}</span>{dash.invoices.outstandingCents != null ? <span className="ml-2 text-muted-foreground">{formatEuro(dash.invoices.outstandingCents)} te ontvangen</span> : null}</p>
                  <Link className="text-hhc-orange-dark underline" href="/commercieel/facturen">Naar facturen</Link>
                </CardContent>
              </Card>
            )}
            {dash.pipeline && (
              <Card>
                <CardHeader><CardTitle className="text-base">Pijplijn</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.pipeline.count}</span><span className="ml-2 text-muted-foreground">open kansen{dash.pipeline.expectedCents != null ? ` · ${formatEuro(dash.pipeline.expectedCents)} verwacht` : ""}</span></p>
                  <Link className="text-hhc-orange-dark underline" href="/commercieel/pijplijn">Naar de pijplijn</Link>
                </CardContent>
              </Card>
            )}
            {dash.counterparts && (
              <Card>
                <CardHeader><CardTitle className="text-base">Tegenprestaties</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-2xl font-bold">{dash.counterparts.open}</span><span className="ml-2 text-muted-foreground">te leveren</span>{dash.counterparts.overdue > 0 ? <span className="ml-2 text-destructive">{dash.counterparts.overdue} te laat</span> : null}</p>
                  <Link className="text-hhc-orange-dark underline" href="/commercieel/tegenprestaties">Naar de planning</Link>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Je hebt toegang tot de sectie, maar nog geen bevoegdheden voor onderdelen. Vraag een beheerder om een rol.
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`grp-${g.id}`}>
            <h2 id={`grp-${g.id}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="block h-full rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-muted">
                    <span className="font-semibold">{i.label}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{i.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Jouw bevoegdheden</CardTitle></CardHeader>
          <CardContent>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Bekijk waar je toegang toe hebt</summary>
              <ul className="mt-3 divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{AREAS[r.key].label}</span>
                    <span className="text-muted-foreground">{LEVEL_LABEL[r.level]}{r.extras.length > 0 ? ` + ${r.extras.length} aanvullend` : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Wil je andere bevoegdheden? Vraag het een beheerder; rechten worden beheerd bij Beheer, Gebruikers en rechten.</p>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
