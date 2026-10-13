"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";
import type { Permission } from "@/lib/commercial/permissions";

export const KIND: Record<string, string> = { CALL: "Telefoongesprek", VISIT: "Bezoek", MEETING: "Afspraak", EMAIL: "E-mail", WHATSAPP: "WhatsApp (handmatig)", QUOTE: "Offerte", OTHER: "Overig" };
export const NATURE: Record<string, string> = { NOTE: "Gespreksnotitie", PROVISIONAL: "Voorlopige toezegging", FORMAL: "Formele afspraak" };

interface Activity {
  id: string;
  companyId: string;
  companyName: string;
  kind: string;
  nature: string;
  occurredAt: string;
  isPlanned: boolean;
  summary: string;
  followUp: string | null;
  contactName: string | null;
  authorName: string | null;
  archivedAt: string | null;
}

/**
 * Contactmomenten met een tab voor gearchiveerde momenten, zoeken, herstellen en definitief wissen.
 * Met `companyId` voor één dossier; zonder voor alle dossiers binnen het eigen bereik.
 */
export function ActivityList({ companyId, can, reloadKey = 0 }: { companyId?: string; can: (p: Permission) => boolean; reloadKey?: number }) {
  const toast = useStableToast();
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ total: number; activities: Activity[] } | null>(null);
  const [erasing, setErasing] = useState<Activity | null>(null);

  // Zoeken pas na een korte pauze in het typen.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (companyId) qs.set("companyId", companyId);
    if (archived) qs.set("archived", "1");
    if (query) qs.set("q", query);
    const r = await api<{ total: number; activities: Activity[] }>(`/api/commercial/activities?${qs}`);
    if (r.ok) setData(r.data);
    else toast.error(r.error);
  }, [companyId, archived, query, toast]);
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function archive(id: string) {
    const r = await api(`/api/commercial/activities/${id}`, "DELETE");
    if (r.ok) {
      toast.success("Contactmoment gearchiveerd. Je vindt het terug onder 'Gearchiveerd'.");
      await load();
    } else toast.error(r.error);
  }
  async function restore(id: string) {
    const r = await api(`/api/commercial/activities/${id}/restore`, "POST");
    if (r.ok) {
      toast.success("Contactmoment hersteld.");
      await load();
    } else toast.error(r.error);
  }
  async function erase(id: string) {
    const r = await api(`/api/commercial/activities/${id}/permanent`, "DELETE");
    setErasing(null);
    if (r.ok) {
      toast.success("Contactmoment definitief gewist.");
      await load();
    } else toast.error(r.error);
  }

  const rows = data?.activities ?? null;
  const tab = (value: boolean, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={archived === value}
      onClick={() => setArchived(value)}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${archived === value ? "border-hhc-orange text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <Card>
      <CardContent className="space-y-0 p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 pt-3">
          <div role="tablist" className="flex">
            {tab(false, "Actief")}
            {tab(true, "Gearchiveerd")}
          </div>
          <Input
            aria-label="Zoek in contactmomenten"
            placeholder={companyId ? "Zoek op tekst of contactpersoon" : "Zoek op tekst, bedrijf of contactpersoon"}
            className="mb-2 h-9 w-full sm:w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {rows === null ? (
          <p className="p-5 text-sm text-muted-foreground">Laden…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            {query ? "Niets gevonden." : archived ? "Geen gearchiveerde contactmomenten." : "Nog geen contactmomenten."}
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a.id} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {!companyId && <Link href={`/commercieel/sponsoren/${a.companyId}`} className="font-semibold text-hhc-orange-dark hover:underline">{a.companyName}</Link>}
                  <span className="font-medium">{KIND[a.kind] ?? a.kind}</span>
                  <Badge variant={a.nature === "FORMAL" ? "success" : a.nature === "PROVISIONAL" ? "primary" : "outline"}>{NATURE[a.nature]}</Badge>
                  {a.isPlanned && <Badge variant="outline">Gepland</Badge>}
                  <span className="text-muted-foreground">{formatDate(a.occurredAt, true)}</span>
                  {a.archivedAt && <Badge variant="outline">Gearchiveerd op {formatDate(a.archivedAt)}</Badge>}
                  <span className="ml-auto flex gap-1">
                    {can("history:archive") && (a.archivedAt
                      ? <Button variant="ghost" size="sm" onClick={() => restore(a.id)}>Herstellen</Button>
                      : <Button variant="ghost" size="sm" onClick={() => archive(a.id)}>Archiveren</Button>)}
                    {can("history:delete") && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setErasing(a)}>Definitief wissen</Button>}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{a.summary}</p>
                {a.followUp && <p className="text-muted-foreground">Vervolg: {a.followUp}</p>}
                <p className="text-xs text-muted-foreground">{[a.contactName && `Met ${a.contactName}`, a.authorName && `Door ${a.authorName}`].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ol>
        )}
        {data && data.total > data.activities.length && (
          <p className="border-t border-border p-3 text-xs text-muted-foreground">De nieuwste {data.activities.length} van {data.total} worden getoond. Zoek gerichter om de rest te vinden.</p>
        )}
      </CardContent>
      {erasing && <EraseDialog activity={erasing} onCancel={() => setErasing(null)} onConfirm={() => erase(erasing.id)} />}
    </Card>
  );
}

function EraseDialog({ activity, onCancel, onConfirm }: { activity: Activity; onCancel: () => void; onConfirm: () => void }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="erase-title" aria-describedby="erase-desc" className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-xl">
        <h2 id="erase-title" className="text-lg font-semibold">Contactmoment definitief wissen?</h2>
        <div id="erase-desc" className="space-y-2 text-sm">
          <p>
            {KIND[activity.kind] ?? activity.kind} van {formatDate(activity.occurredAt, true)}
            {activity.companyName ? ` bij ${activity.companyName}` : ""}.
          </p>
          <p className="font-medium text-destructive">Dit kan niet ongedaan worden gemaakt. De inhoud is daarna nergens meer terug te vinden.</p>
          <p className="text-muted-foreground">Wil je het alleen uit de lijst halen? Kies dan Archiveren; dan kun je het later herstellen.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy} autoFocus>Annuleren</Button>
          <Button variant="destructive" disabled={busy} onClick={() => { setBusy(true); onConfirm(); }}>Definitief wissen</Button>
        </div>
      </div>
    </div>
  );
}
