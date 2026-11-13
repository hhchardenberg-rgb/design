"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";
import type { Permission } from "@/lib/commercial/permissions";

interface Banner {
  id: string;
  name: string;
  title: string;
  text: string | null;
  buttonLabel: string;
  targetUrl: string;
  active: boolean;
  startsOn: string | null;
  endsOn: string | null;
  live: boolean;
  sent: number;
  clicks: number;
  uniqueClicks: number;
  ctr: number | null;
}

const EMPTY = { name: "", title: "", text: "", buttonLabel: "Bekijk het aanbod", targetUrl: "https://", active: true, startsOn: "", endsOn: "" };

/** Een aanbieding van deze sponsor onder de ticketmail van HHC, met het aantal weergaven en kliks. */
export function TicketmailTab({ companyId, can }: { companyId: string; can: (p: Permission) => boolean }) {
  const toast = useStableToast();
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [form, setForm] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = can("companies:update");

  const load = useCallback(async () => {
    const r = await api<{ banners: Banner[] }>(`/api/commercial/companies/${companyId}/ticket-banners`);
    if (r.ok) setBanners(r.data.banners);
    else toast.error(r.error);
  }, [companyId, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form) return;
    setBusy(true);
    const { id, ...rest } = form;
    const body = { ...rest, text: rest.text || null, startsOn: rest.startsOn || null, endsOn: rest.endsOn || null };
    const r = id ? await api(`/api/commercial/companies/${companyId}/ticket-banners/${id}`, "PUT", body) : await api(`/api/commercial/companies/${companyId}/ticket-banners`, "POST", body);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Banner opgeslagen.");
    setForm(null);
    void load();
  }

  async function remove(b: Banner) {
    if (!window.confirm(`Banner '${b.name}' verwijderen? De cijfers verdwijnen ook.`)) return;
    const r = await api(`/api/commercial/companies/${companyId}/ticket-banners/${b.id}`, "DELETE");
    if (!r.ok) return toast.error(r.error);
    toast.success("Banner verwijderd.");
    void load();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Onder de ticketmail van HHC komt een blok &ldquo;Aangeboden door een sponsor&rdquo;. Zijn er meerdere lopende banners, dan komen ze om de beurt aan bod. Een klik wordt geteld per ticket; er worden geen namen of e-mailadressen opgeslagen.
      </p>
      {canEdit && !form && <Button size="sm" onClick={() => setForm({ ...EMPTY })}>Banner toevoegen</Button>}

      {form && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bn-name">Naam (alleen voor ons)</Label>
              <Input id="bn-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bn-title">Kop in de mail</Label>
              <Input id="bn-title" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="bn-text">Tekst (optioneel, max. 240 tekens)</Label>
              <Textarea id="bn-text" className="min-h-16" maxLength={240} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bn-btn">Tekst van de link</Label>
              <Input id="bn-btn" value={form.buttonLabel} maxLength={40} onChange={(e) => setForm({ ...form, buttonLabel: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bn-url">Waar leidt de klik naartoe?</Label>
              <Input id="bn-url" type="url" value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bn-from">Tonen vanaf (optioneel)</Label>
              <Input id="bn-from" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bn-until">Tonen tot en met (optioneel)</Label>
              <Input id="bn-until" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Actief
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" onClick={save} disabled={busy}>Opslaan</Button>
              <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Annuleren</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {banners && banners.length === 0 && !form && <p className="text-sm text-muted-foreground">Er is nog geen banner voor deze sponsor.</p>}
      {banners?.map((b) => (
        <Card key={b.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{b.name}</p>
              <Badge variant={b.live ? "success" : "outline"}>{b.live ? "Loopt nu" : b.active ? "Gepland of verlopen" : "Uit"}</Badge>
              {(b.startsOn || b.endsOn) && <span className="text-xs text-muted-foreground">{b.startsOn ? formatDate(b.startsOn) : "…"} t/m {b.endsOn ? formatDate(b.endsOn) : "…"}</span>}
            </div>
            <p className="text-sm">{b.title}{b.text ? ` · ${b.text}` : ""}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Getoond in mails</dt><dd className="text-lg font-semibold">{b.sent}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Kliks</dt><dd className="text-lg font-semibold">{b.clicks}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Verschillende tickets</dt><dd className="text-lg font-semibold">{b.uniqueClicks}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Klikratio</dt><dd className="text-lg font-semibold">{b.ctr == null ? "–" : `${b.ctr}%`}</dd></div>
            </dl>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setForm({ id: b.id, name: b.name, title: b.title, text: b.text ?? "", buttonLabel: b.buttonLabel, targetUrl: b.targetUrl, active: b.active, startsOn: b.startsOn ?? "", endsOn: b.endsOn ?? "" })}>Wijzigen</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(b)}>Verwijderen</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
