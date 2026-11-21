import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { ModuleIndex } from "@/components/module-index";
import { StatStrip, type StatItem } from "@/components/dashboard/stat-strip";
import { iconForHref } from "@/components/shell/nav-icons";
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

  const stats: StatItem[] = [];
  if (dash?.tasks) stats.push({ label: "Mijn open taken", value: dash.tasks.total, hint: dash.overdueTasks ? `${dash.overdueTasks} achterstallig` : "niets achterstallig", tone: dash.overdueTasks ? "danger" : "default", href: "/commercieel/taken" });
  if (dash?.contracts) stats.push({ label: "Aflopende contracten", value: dash.contracts.total, hint: "binnen 90 dagen", href: "/commercieel/contracten" });
  if (dash?.invoices) stats.push({ label: "Openstaande facturen", value: dash.invoices.count, hint: dash.invoices.outstandingCents != null ? `${formatEuro(dash.invoices.outstandingCents)} te ontvangen` : undefined, href: "/commercieel/facturen" });
  if (dash?.pipeline) stats.push({ label: "Pijplijn", value: dash.pipeline.count, hint: "open kansen", href: "/commercieel/pijplijn" });
  if (dash?.contactGaps) stats.push({ label: "Contactmoment nodig", value: dash.contactGaps.total, hint: "al lang niet gesproken", tone: dash.contactGaps.total ? "attention" : "default", href: "/commercieel/contactmomenten" });
  if (dash?.counterparts) stats.push({ label: "Tegenprestaties", value: dash.counterparts.open, hint: dash.counterparts.overdue > 0 ? `${dash.counterparts.overdue} te laat` : "te leveren", tone: dash.counterparts.overdue > 0 ? "danger" : "default", href: "/commercieel/tegenprestaties" });

  const lists = [
    dash?.tasks && {
      key: "tasks",
      title: "Mijn open taken",
      href: "/commercieel/taken",
      more: "Alle taken",
      empty: "Geen open taken. Lekker bezig.",
      rows: dash.tasks.rows.map((t) => ({ id: t.id, title: t.title, href: "/commercieel/taken", meta: [t.companyName, t.dueAt && formatDate(t.dueAt)].filter(Boolean).join(" · ") })),
    },
    dash?.contracts && {
      key: "contracts",
      title: "Aflopende contracten",
      href: "/commercieel/contracten",
      more: "Alle contracten",
      empty: "Geen contracten die binnen 90 dagen aflopen.",
      rows: dash.contracts.rows.map((c) => ({ id: c.id, title: c.companyName, href: `/commercieel/sponsoren/${c.companyId}`, meta: `${c.seasonName} · einde ${formatDate(c.endsOn)}${c.noticeUntil ? ` · opzeggen vóór ${formatDate(c.noticeUntil)}` : ""}` })),
    },
    dash?.contactGaps && {
      key: "gaps",
      title: "Contactmoment nodig",
      href: "/commercieel/contactmomenten",
      more: "Alles bekijken",
      empty: "Je hebt al je sponsoren recent gesproken.",
      rows: dash.contactGaps.rows.map((g) => ({ id: g.companyId, title: g.companyName, href: `/commercieel/sponsoren/${g.companyId}`, meta: g.lastContactOn ? `laatst gesproken ${formatDate(g.lastContactOn)} (${g.daysSince} dagen)` : "nog geen contactmoment vastgelegd" })),
    },
  ].filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Commerciële Zaken" title="Startpagina" description="Sponsorbeheer van HHC Hardenberg: wat vandaag aandacht vraagt, en alle onderdelen op één plek." />

      {stats.length > 0 && <StatStrip items={stats} />}

      {lists.length > 0 && (
        <div className={`grid gap-5 ${lists.length >= 3 ? "xl:grid-cols-3" : lists.length === 2 ? "lg:grid-cols-2" : ""}`}>
          {lists.map((l) => (
            <section key={l.key} aria-labelledby={`l-${l.key}`} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3.5">
                <h2 id={`l-${l.key}`} className="text-[0.9375rem] font-bold">{l.title}</h2>
                <Link className="shrink-0 text-sm font-semibold text-hhc-orange-dark hover:underline" href={l.href}>{l.more}</Link>
              </div>
              {l.rows.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">{l.empty}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {l.rows.map((r) => (
                    <li key={r.id}>
                      <Link href={r.href} className="block px-5 py-3 transition-colors hover:bg-[#fafaf8]">
                        <span className="block truncate text-sm font-semibold">{r.title}</span>
                        {r.meta && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.meta}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {newsPosts.length > 0 && (
        <section>
          <SectionHeader title="Nieuws" action={<Link className="font-semibold text-hhc-orange-dark hover:underline" href="/commercieel/nieuws">Alle berichten</Link>} />
          <NewsPosts variant="dashboard" posts={newsPosts} />
        </section>
      )}

      {!hasPermissions ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-muted-foreground">
          Je hebt toegang tot Commerciële Zaken, maar nog geen bevoegdheden voor onderdelen. Vraag een beheerder om een rol.
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.id}>
            <SectionHeader title={g.label} />
            <ModuleIndex items={g.items.map((i) => ({ key: i.href, title: i.label, description: i.description, href: i.href, icon: iconForHref(i.href) }))} />
          </section>
        ))
      )}
    </div>
  );
}
