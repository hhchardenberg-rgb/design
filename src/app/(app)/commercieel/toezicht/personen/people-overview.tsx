"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, formatDate } from "@/lib/commercial/client";
import { AUDIT_ACTION_LABELS } from "@/lib/commercial/audit-labels";

interface Person { id: string; name: string | null; email: string; openTasks: number; overdueTasks: number; openOpportunities: number; companies: number }
interface Detail {
  user: { id: string; name: string | null; email: string };
  tasks: { id: string; title: string; dueAt: string | null; overdue: boolean; priority: string; companyId: string | null; companyName: string | null }[];
  opportunities: { id: string; title: string; stage: string; expectedCloseOn: string | null; companyId: string; companyName: string }[];
  counterparts: { id: string; title: string; status: string; dueOn: string | null; companyId: string; companyName: string }[];
  companies: { id: string; name: string; status: string }[];
  activity: { id: string; at: string; action: string; entity: string }[];
}

const STAGE: Record<string, string> = { LEAD: "Lead", CONTACTED: "Contact gehad", PROPOSAL: "Voorstel", NEGOTIATION: "Onderhandeling" };

export function PeopleOverview() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ people: Person[] }>("/api/commercial/oversight/people").then((r) => (r.ok ? setPeople(r.data.people) : setError(r.error)));
  }, []);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void api<Detail>(`/api/commercial/oversight/people/${selected}`).then((r) => {
      if (cancelled) return;
      if (r.ok) { setDetail(r.data); setError(null); } else setError(r.error);
    });
    return () => { cancelled = true; };
  }, [selected]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Per persoon</h1>
        <p className="text-sm text-muted-foreground">Wat per persoon openstaat: taken, kansen, tegenprestaties en dossiers. Als beheerder zie je dit voor iedereen, ongeacht het eigen bereik. Bedragen staan hier niet.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader><CardTitle>Personen</CardTitle></CardHeader>
          <CardContent>
            {!people ? <p className="text-sm text-muted-foreground">Laden…</p> : people.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen personen.</p> : (
              <ul className="divide-y divide-border text-sm">
                {people.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setSelected(p.id)} aria-current={selected === p.id} className={`w-full py-2 text-left hover:underline ${selected === p.id ? "font-semibold" : ""}`}>
                      {p.name ?? p.email}
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {p.openTasks} open taken{p.overdueTasks > 0 ? ` (${p.overdueTasks} achterstallig)` : ""} · {p.openOpportunities} kansen · {p.companies} dossiers
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4">
          {!detail || detail.user.id !== selected ? <Card><CardContent className="p-5 text-sm text-muted-foreground">Kies links een persoon.</CardContent></Card> : (
            <>
              <Section title={`Open taken (${detail.tasks.length})`} empty="Geen open taken.">
                {detail.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{t.title}</span>{t.companyId && <> · <Link className="underline" href={`/commercieel/sponsoren/${t.companyId}`}>{t.companyName}</Link></>}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">{t.overdue && <Badge variant="primary">Achterstallig</Badge>}{t.dueAt ? formatDate(t.dueAt, true) : "geen deadline"}</span>
                  </li>
                ))}
              </Section>
              <Section title={`Open kansen (${detail.opportunities.length})`} empty="Geen open kansen.">
                {detail.opportunities.map((o) => (
                  <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span><span className="font-medium">{o.title}</span> · <Link className="underline" href={`/commercieel/sponsoren/${o.companyId}`}>{o.companyName}</Link></span>
                    <span className="text-muted-foreground">{STAGE[o.stage] ?? o.stage}{o.expectedCloseOn ? ` · ${formatDate(o.expectedCloseOn)}` : ""}</span>
                  </li>
                ))}
              </Section>
              <Section title={`Tegenprestaties onder zijn of haar verantwoordelijkheid (${detail.counterparts.length})`} empty="Geen openstaande tegenprestaties.">
                {detail.counterparts.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span><span className="font-medium">{c.title}</span> · <Link className="underline" href={`/commercieel/sponsoren/${c.companyId}`}>{c.companyName}</Link></span>
                    <span className="text-muted-foreground">{c.dueOn ? formatDate(c.dueOn) : "geen datum"}</span>
                  </li>
                ))}
              </Section>
              <Section title={`Dossiers als eigenaar (${detail.companies.length})`} empty="Geen dossiers.">
                {detail.companies.map((c) => <li key={c.id} className="py-2"><Link className="underline" href={`/commercieel/sponsoren/${c.id}`}>{c.name}</Link></li>)}
              </Section>
              <Section title="Laatste handelingen" empty="Nog niets vastgelegd.">
                {detail.activity.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{AUDIT_ACTION_LABELS[a.action] ?? a.action}</span><span className="text-muted-foreground">{formatDate(a.at, true)}</span></li>
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y divide-border text-sm">{children}</ul>}</CardContent>
    </Card>
  );
}
