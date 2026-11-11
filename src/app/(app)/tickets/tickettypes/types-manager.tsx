"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDay } from "@/lib/date-format";
import { TICKET_CATEGORIES, VALIDITY_MODES, type TicketCategory, type ValidityMode } from "@/lib/tickets/rules";
import { api, errorText, isoDay, PageTitle } from "@/components/tickets/parts";
import { SEASON_PHASE_LABEL, seasonOptionLabel, seasonPhase } from "@/lib/commercial/season-phase";

interface Season {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface Zone {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
}
interface TypeRow {
  id: string;
  name: string;
  description: string | null;
  category: TicketCategory;
  validityMode: ValidityMode;
  isSeasonCard: boolean;
  seasonId: string | null;
  season: { name: string } | null;
  competitions: string[];
  homeOnly: boolean;
  validFrom: string | null;
  validUntil: string | null;
  zoneId: string | null;
  zone: { name: string } | null;
  color: string | null;
  active: boolean;
  _count: { tickets: number };
}

type TypeDraft = Omit<TypeRow, "season" | "zone" | "_count" | "id" | "competitions" | "description" | "color" | "validFrom" | "validUntil" | "seasonId" | "zoneId"> & {
  id: string | null;
  description: string;
  competitions: string;
  color: string;
  validFrom: string;
  validUntil: string;
  seasonId: string;
  zoneId: string;
};

const EMPTY_TYPE: TypeDraft = { id: null, name: "", description: "", category: "FREE", validityMode: "SINGLE", isSeasonCard: false, seasonId: "", competitions: "", homeOnly: true, validFrom: "", validUntil: "", zoneId: "", color: "", active: true };

export function TypesManager({ canManage }: { canManage: boolean }) {
  const toast = useStableToast();
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [zoneDraft, setZoneDraft] = useState<{ id: string | null; name: string; description: string; active: boolean; sortOrder: number } | null>(null);
  const [seasonDraft, setSeasonDraft] = useState<{ id: string | null; name: string; startsOn: string; endsOn: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, z, s] = await Promise.all([api<{ types: TypeRow[] }>("/api/tickets/types"), api<{ zones: Zone[] }>("/api/tickets/zones"), api<{ seasons: Season[] }>("/api/tickets/seasons")]);
      setTypes(t.types);
      setZones(z.zones);
      setSeasons(s.seasons);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string, done: () => void) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      done();
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function saveType() {
    if (!draft) return;
    const body = {
      ...draft,
      competitions: draft.competitions
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      seasonId: draft.seasonId || null,
      zoneId: draft.zoneId || null,
      validFrom: draft.validFrom || null,
      validUntil: draft.validUntil || null,
      color: draft.color || null,
    };
    void run(() => api(draft.id ? `/api/tickets/types/${draft.id}` : "/api/tickets/types", { method: draft.id ? "PUT" : "POST", body }), "Tickettype opgeslagen.", () => setDraft(null));
  }

  return (
    <div className="space-y-8">
      <PageTitle title="Tickettypes en vakken" description="Per tickettype de categorie, geldigheid en het standaardvak. Wijzigingen gelden voor nieuwe tickets; uitgegeven tickets houden hun eigen regels.">
        {canManage && (
          <Button onClick={() => setDraft({ ...EMPTY_TYPE })}>
            <Plus className="h-4 w-4" /> Nieuw tickettype
          </Button>
        )}
      </PageTitle>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{draft.id ? "Tickettype wijzigen" : "Nieuw tickettype"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ty-name">Naam</Label>
              <Input id="ty-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="bv. Vrijkaart tribune" />
            </div>
            <div>
              <Label htmlFor="ty-cat">Categorie</Label>
              <Select
                id="ty-cat"
                value={draft.category}
                onChange={(e) => {
                  const category = e.target.value as TicketCategory;
                  setDraft({ ...draft, category, ...(category === "SEASON" ? { isSeasonCard: true, validityMode: "SEASON" as ValidityMode } : {}) });
                }}
              >
                {Object.entries(TICKET_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ty-mode">Geldig voor</Label>
              <Select id="ty-mode" value={draft.validityMode} onChange={(e) => setDraft({ ...draft, validityMode: e.target.value as ValidityMode })}>
                {Object.entries(VALIDITY_MODES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ty-zone">Standaard toegangsvak</Label>
              <Select id="ty-zone" value={draft.zoneId} onChange={(e) => setDraft({ ...draft, zoneId: e.target.value })}>
                <option value="">Geen (alle vakken)</option>
                {zones
                  .filter((z) => z.active || z.id === draft.zoneId)
                  .map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
              </Select>
            </div>
            {draft.validityMode === "SEASON" && (
              <>
                <div>
                  <Label htmlFor="ty-season">Seizoen (standaard)</Label>
                  <Select id="ty-season" value={draft.seasonId} onChange={(e) => setDraft({ ...draft, seasonId: e.target.value })}>
                    <option value="">Kiezen bij uitgifte</option>
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {seasonOptionLabel(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ty-comp">Alleen deze competities</Label>
                  <Input id="ty-comp" value={draft.competitions} onChange={(e) => setDraft({ ...draft, competitions: e.target.value })} placeholder="Leeg = alle; scheiden met komma's" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.homeOnly} onChange={(e) => setDraft({ ...draft, homeOnly: e.target.checked })} /> Alleen thuiswedstrijden
                </label>
              </>
            )}
            {draft.validityMode === "RANGE" && (
              <>
                <div>
                  <Label htmlFor="ty-from">Geldig vanaf</Label>
                  <Input id="ty-from" type="date" value={draft.validFrom} onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="ty-until">Geldig tot en met</Label>
                  <Input id="ty-until" type="date" value={draft.validUntil} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} />
                  <p className="mt-1 text-xs text-muted-foreground">Leeg = kiezen bij uitgifte.</p>
                </div>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.isSeasonCard} onChange={(e) => setDraft({ ...draft, isSeasonCard: e.target.checked })} /> Seizoenskaart (herintrede mogelijk waar de wedstrijd dat toestaat)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Actief (beschikbaar bij uitgifte)
            </label>
            <div className="sm:col-span-2">
              <Label htmlFor="ty-desc">Omschrijving</Label>
              <Textarea id="ty-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={saveType} disabled={busy || !draft.name}>
                Opslaan
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                Annuleren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {types.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nog geen tickettypes.</p>
          ) : (
            <ul className="divide-y divide-border">
              {types.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {t.name} {!t.active && <Badge variant="outline">Niet actief</Badge>} {t.isSeasonCard && <Badge variant="primary">Seizoenskaart</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TICKET_CATEGORIES[t.category]} · {VALIDITY_MODES[t.validityMode]}
                      {t.season ? ` · ${t.season.name}` : ""}
                      {t.zone ? ` · vak ${t.zone.name}` : ""}
                      {t.competitions.length ? ` · ${t.competitions.join(", ")}` : ""}
                      {t.validityMode === "RANGE" && (t.validFrom || t.validUntil) ? ` · ${formatDay(t.validFrom?.slice(0, 10))} t/m ${formatDay(t.validUntil?.slice(0, 10))}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{t._count.tickets} tickets</span>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t.name} wijzigen`}
                      onClick={() =>
                        setDraft({
                          id: t.id,
                          name: t.name,
                          description: t.description ?? "",
                          category: t.category,
                          validityMode: t.validityMode,
                          isSeasonCard: t.isSeasonCard,
                          seasonId: t.seasonId ?? "",
                          competitions: t.competitions.join(", "),
                          homeOnly: t.homeOnly,
                          validFrom: isoDay(t.validFrom),
                          validUntil: isoDay(t.validUntil),
                          zoneId: t.zoneId ?? "",
                          color: t.color ?? "",
                          active: t.active,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Toegangsvakken</CardTitle>
              <CardDescription>Toegangstype of vak, zoals Tribune, VIP-ruimte of Pers.</CardDescription>
            </div>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setZoneDraft({ id: null, name: "", description: "", active: true, sortOrder: zones.length })}>
                <Plus className="h-4 w-4" /> Vak
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {zoneDraft && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Input aria-label="Naam van het vak" placeholder="Naam" value={zoneDraft.name} onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })} />
                <Input aria-label="Omschrijving" placeholder="Omschrijving (optioneel)" value={zoneDraft.description} onChange={(e) => setZoneDraft({ ...zoneDraft, description: e.target.value })} />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={zoneDraft.active} onChange={(e) => setZoneDraft({ ...zoneDraft, active: e.target.checked })} /> Actief
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || !zoneDraft.name}
                    onClick={() => run(() => api(zoneDraft.id ? `/api/tickets/zones/${zoneDraft.id}` : "/api/tickets/zones", { method: zoneDraft.id ? "PUT" : "POST", body: { ...zoneDraft, description: zoneDraft.description || null } }), "Vak opgeslagen.", () => setZoneDraft(null))}
                  >
                    Opslaan
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setZoneDraft(null)}>
                    Annuleren
                  </Button>
                </div>
              </div>
            )}
            {zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen vakken.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {zones.map((z) => (
                  <li key={z.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1">
                      {z.name} {!z.active && <Badge variant="outline">Niet actief</Badge>}
                      {z.description && <span className="block text-xs text-muted-foreground">{z.description}</span>}
                    </span>
                    {canManage && (
                      <Button size="sm" variant="ghost" aria-label={`${z.name} wijzigen`} onClick={() => setZoneDraft({ id: z.id, name: z.name, description: z.description ?? "", active: z.active, sortOrder: z.sortOrder })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Seizoenen</CardTitle>
              <CardDescription>Voor seizoenskaarten en het automatisch indelen van wedstrijden.</CardDescription>
            </div>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setSeasonDraft({ id: null, name: "", startsOn: "", endsOn: "" })}>
                <Plus className="h-4 w-4" /> Seizoen
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {seasonDraft && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Input aria-label="Naam van het seizoen" placeholder="Naam, bv. 2026/2027" value={seasonDraft.name} onChange={(e) => setSeasonDraft({ ...seasonDraft, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="se-from">Vanaf</Label>
                    <Input id="se-from" type="date" value={seasonDraft.startsOn} onChange={(e) => setSeasonDraft({ ...seasonDraft, startsOn: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="se-to">Tot en met</Label>
                    <Input id="se-to" type="date" value={seasonDraft.endsOn} onChange={(e) => setSeasonDraft({ ...seasonDraft, endsOn: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || !seasonDraft.name || !seasonDraft.startsOn || !seasonDraft.endsOn}
                    onClick={() => run(() => api(seasonDraft.id ? `/api/tickets/seasons/${seasonDraft.id}` : "/api/tickets/seasons", { method: seasonDraft.id ? "PUT" : "POST", body: seasonDraft }), "Seizoen opgeslagen.", () => setSeasonDraft(null))}
                  >
                    Opslaan
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSeasonDraft(null)}>
                    Annuleren
                  </Button>
                </div>
              </div>
            )}
            {seasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen seizoenen.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {seasons.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1">
                      {SEASON_PHASE_LABEL[seasonPhase(s)]} <span className="text-muted-foreground">({s.name})</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDay(s.startsOn.slice(0, 10))} t/m {formatDay(s.endsOn.slice(0, 10))}
                      </span>
                    </span>
                    {canManage && (
                      <Button size="sm" variant="ghost" aria-label={`${s.name} wijzigen`} onClick={() => setSeasonDraft({ id: s.id, name: s.name, startsOn: s.startsOn.slice(0, 10), endsOn: s.endsOn.slice(0, 10) })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
