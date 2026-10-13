import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { visibleNavGroups } from "@/lib/commercial/navigation";
import { AREAS, AREA_KEYS, levelFor } from "@/lib/commercial/permissions";

export const metadata: Metadata = { title: "Commerciële Zaken" };
export const dynamic = "force-dynamic";

const LEVEL_LABEL = { none: "Geen toegang", read: "Alleen lezen", edit: "Lezen en bewerken" } as const;

export default async function CommercialHome() {
  const session = await auth();
  const access = await loadCommercialAccess(session!.user.id);
  const groups = visibleNavGroups(access.can);
  const rows = AREA_KEYS.map((key) => ({ key, ...levelFor(key, access.allowed) })).filter((r) => r.level !== "none");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Commerciële Zaken</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sponsorbeheer van HHC Hardenberg. Kies hieronder waar je mee aan de slag wilt, of gebruik het menu links.</p>
      </div>

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
