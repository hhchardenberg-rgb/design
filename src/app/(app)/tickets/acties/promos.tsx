"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText, fromLocalInput, PageTitle } from "@/components/tickets/parts";
import { formatDayTime } from "@/lib/date-format";
import { EMPTY_SETTINGS, IssueSettings, type IssueSettingsValue } from "@/components/tickets/issue-settings";

interface Promo {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  claims: number;
  maxClaims: number;
  ticketsPerClaim: number;
  maxPerEmail: number;
  claimUntil: string | null;
}

export function Promos() {
  const toast = useStableToast();
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [settings, setSettings] = useState<IssueSettingsValue>(EMPTY_SETTINGS);
  const [f, setF] = useState({ name: "", note: "", code: "", maxClaims: "50", maxPerEmail: "1", ticketsPerClaim: "1", claimUntil: "" });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    try {
      setPromos((await api<{ promos: Promo[] }>("/api/tickets/promos")).promos);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);
  useEffect(() => void load(), [load]);

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ code: string }>("/api/tickets/promos", {
        body: { name: f.name, note: f.note || null, code: f.code || null, typeId: settings.typeId, zoneId: settings.zoneId || null, seasonId: settings.seasonId || null, eventIds: settings.eventIds, claimUntil: f.claimUntil ? fromLocalInput(f.claimUntil) : null, maxClaims: Number(f.maxClaims), maxPerEmail: Number(f.maxPerEmail), ticketsPerClaim: Number(f.ticketsPerClaim) },
      });
      toast.success(`Actie aangemaakt. Code: ${r.code}`);
      setF({ name: "", note: "", code: "", maxClaims: "50", maxPerEmail: "1", ticketsPerClaim: "1", claimUntil: "" });
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p: Promo) {
    try {
      await api(`/api/tickets/promos/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      await load();
    } catch (e) {
      toast.error(errorText(e));
    }
  }
  const copy = (p: Promo) => navigator.clipboard?.writeText(`${origin}/actie/${p.code}`).then(() => toast.success("Link gekopieerd."), () => toast.error("Kopiëren lukte niet."));

  return (
    <div className="space-y-5">
      <PageTitle title="Actiecodes" description="Laat mensen zelf een ticket aanvragen met een code of link, bijvoorbeeld voor 'neem een vriend mee' of een jeugdteam. Het ticket wordt direct per e-mail verstuurd." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lopende acties</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {promos && promos.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nog geen acties.</p>}
          <ul className="divide-y divide-border text-sm">
            {promos?.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {p.name} <span className="ml-1 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">{p.code}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.type} · {p.claims} van {p.maxClaims} ingewisseld · {p.ticketsPerClaim} per aanvraag · max {p.maxPerEmail} per e-mailadres{p.claimUntil ? ` · t/m ${formatDayTime(p.claimUntil)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(p)}>
                    Link kopiëren
                  </Button>
                  <Button size="sm" variant={p.active ? "outline" : "primary"} onClick={() => void toggle(p)}>
                    {p.active ? "Uitzetten" : "Aanzetten"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <IssueSettings value={settings} onChange={setSettings} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nieuwe actie</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <Label htmlFor="pr-name">Naam van de actie</Label>
            <Input id="pr-name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Neem een vriend mee" />
          </div>
          <div>
            <Label htmlFor="pr-code">Eigen code (leeg = automatisch)</Label>
            <Input id="pr-code" value={f.code} onChange={(e) => set({ code: e.target.value })} placeholder="JO15-2026" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pr-note">Toelichting op de pagina (optioneel)</Label>
            <Input id="pr-note" value={f.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="pr-max">Aantal aanvragen in totaal</Label>
            <Input id="pr-max" type="number" min={1} value={f.maxClaims} onChange={(e) => set({ maxClaims: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="pr-per">Aanvragen per e-mailadres</Label>
            <Input id="pr-per" type="number" min={1} max={20} value={f.maxPerEmail} onChange={(e) => set({ maxPerEmail: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="pr-tpc">Tickets per aanvraag (2 = neem een vriend mee)</Label>
            <Input id="pr-tpc" type="number" min={1} max={10} value={f.ticketsPerClaim} onChange={(e) => set({ ticketsPerClaim: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="pr-until">Aanvragen kan t/m (optioneel)</Label>
            <Input id="pr-until" type="datetime-local" value={f.claimUntil} onChange={(e) => set({ claimUntil: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={busy || !f.name.trim() || !settings.typeId} onClick={() => void create()}>
              {busy ? "Bezig…" : "Actie aanmaken"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
