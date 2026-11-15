"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDayTime } from "@/lib/date-format";
import { api, errorText } from "@/components/tickets/parts";

interface Item {
  id: string;
  kind: "TYPE" | "ZONE";
  name: string;
  price: number | null;
  category: string | null;
  active: boolean;
  eventCount: number;
  lastSeenAt: string;
  typeId: string | null;
  typeName: string | null;
  zoneId: string | null;
  zoneName: string | null;
}
interface Option {
  id: string;
  name: string;
  active: boolean;
}
interface Catalog {
  items: Item[];
  hhcTypes: Option[];
  hhcZones: Option[];
}

const euro = (v: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v);

/** Kaartsoorten en toegangsvakken uit Fullhouse, met per regel de koppeling aan een HHC-tickettype of -vak. Alleen lezen richting Fullhouse. */
export function CatalogCard({ canManage, canCreate }: { canManage: boolean; canCreate: boolean }) {
  const toast = useStableToast();
  const [d, setD] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<Catalog>("/api/tickets/fullhouse/catalog"));
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      toast.success(await fn());
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
      await load();
    }
  }

  const link = (i: Item, body: { targetId?: string | null; create?: boolean }) =>
    act(i.id, async () => {
      await api(`/api/tickets/fullhouse/catalog/${i.id}`, { method: "PUT", body });
      return body.create ? `${i.name} overgenomen in HHC.` : body.targetId ? "Gekoppeld." : "Ontkoppeld.";
    });

  if (!d) return null;
  const zones = d.items.filter((i) => i.kind === "ZONE");
  const types = d.items.filter((i) => i.kind === "TYPE");
  const unlinked = zones.filter((z) => !z.zoneId).length + types.filter((t) => t.active && !t.typeId).length;

  function rows(list: Item[], kind: "TYPE" | "ZONE") {
    const options = kind === "ZONE" ? d!.hhcZones : d!.hhcTypes;
    if (list.length === 0) return <p className="py-2 text-sm text-muted-foreground">Nog niets binnengehaald.</p>;
    return (
      <ul className="divide-y divide-border">
        {list.map((i) => {
          const current = kind === "ZONE" ? i.zoneId : i.typeId;
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {i.name} {!i.active && <Badge variant="outline">Niet meer in Fullhouse</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {kind === "TYPE" && i.price != null ? `${euro(i.price)} · ` : ""}
                  {kind === "TYPE" && i.category ? `vak ${i.category} · ` : ""}
                  {i.eventCount} {i.eventCount === 1 ? "evenement" : "evenementen"} · gezien {formatDayTime(i.lastSeenAt)}
                </p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select aria-label={`HHC-${kind === "ZONE" ? "vak" : "tickettype"} voor ${i.name}`} className="w-56" value={current ?? ""} disabled={!!busy} onChange={(e) => link(i, { targetId: e.target.value || null })}>
                    <option value="">Niet gekoppeld</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.active ? "" : " (niet actief)"}
                      </option>
                    ))}
                  </Select>
                  {!current && canCreate && (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => link(i, { create: true })}>
                      Overnemen
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">{(kind === "ZONE" ? i.zoneName : i.typeName) ?? "Niet gekoppeld"}</span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Soorten kaarten en toegangsvakken</CardTitle>
          <CardDescription>
            Binnengehaald uit Fullhouse (alleen lezen, Fullhouse wordt nooit aangepast). Dit gebeurt ook automatisch bij &quot;Evenementen ophalen&quot; en elke nacht. Koppel elke regel aan een HHC-tickettype of -vak, of neem hem over. Een overgenomen tickettype staat eerst op niet actief, zodat je de categorie kunt nakijken.
          </CardDescription>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("refresh", async () => { const r = await api<{ types: number; zones: number; created: number; linked: number }>("/api/tickets/fullhouse/catalog", { body: { action: "refresh" } }); return `${r.types} kaartsoorten en ${r.zones} vakken gelezen, ${r.created} nieuw, ${r.linked} automatisch gekoppeld op naam.`; })}>
              {busy === "refresh" ? "Bezig…" : "Nu synchroniseren"}
            </Button>
            {canCreate && unlinked > 0 && (
              <Button size="sm" disabled={!!busy} onClick={() => act("adopt", async () => { const r = await api<{ types: number; zones: number }>("/api/tickets/fullhouse/catalog", { body: { action: "adoptAll" } }); return `${r.zones} vakken en ${r.types} kaartsoorten overgenomen.`; })}>
                Alles overnemen ({unlinked})
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-semibold">Toegangsvakken ({zones.length})</p>
          {rows(zones, "ZONE")}
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Soorten kaarten ({types.length})</p>
          {rows(types, "TYPE")}
        </div>
      </CardContent>
    </Card>
  );
}
