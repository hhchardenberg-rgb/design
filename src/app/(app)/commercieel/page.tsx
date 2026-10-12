import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { AREAS, AREA_KEYS, levelFor } from "@/lib/commercial/permissions";

export const metadata: Metadata = { title: "Commerciële Zaken" };
export const dynamic = "force-dynamic";

const LEVEL_LABEL = { none: "Geen toegang", read: "Alleen lezen", edit: "Lezen en bewerken" } as const;

export default async function CommercialHome() {
  const session = await auth();
  const access = await loadCommercialAccess(session!.user.id);

  const rows = AREA_KEYS.map((key) => ({ key, ...levelFor(key, access.allowed) }));
  const withAccess = rows.filter((r) => r.level !== "none");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Commerciële Zaken</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          De werkomgeving van de sponsorcommissie wordt stap voor stap opgebouwd. Op dit moment is alleen het
          rechtenbeheer beschikbaar; sponsordossiers, contracten en facturatie volgen in de volgende fasen.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Jouw bevoegdheden</CardTitle>
          <CardDescription>Dit zijn de onderdelen waarvoor jij toegang hebt gekregen.</CardDescription>
        </CardHeader>
        <CardContent>
          {withAccess.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Je hebt toegang tot de sectie, maar nog geen bevoegdheden voor onderdelen. Vraag een beheerder om een rol.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {withAccess.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{AREAS[r.key].label}</span>
                  <span className="text-muted-foreground">
                    {LEVEL_LABEL[r.level]}
                    {r.extras.length > 0 ? ` + ${r.extras.length} aanvullend` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
