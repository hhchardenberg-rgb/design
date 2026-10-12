"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { api, formatDate } from "@/lib/commercial/client";

interface Row {
  id: string;
  name: string;
  tradeName: string | null;
  status: string;
  city: string | null;
  ownerName: string | null;
  tags: string[];
  lastContactAt: string | null;
  openTasks: number;
  nextActionDue: string | null;
}
interface ListResult {
  total: number;
  page: number;
  pageSize: number;
  rows: Row[];
}

const STATUS: Record<string, { label: string; variant: "primary" | "success" | "outline" }> = {
  PROSPECT: { label: "Potentieel", variant: "primary" },
  ACTIVE: { label: "Actief", variant: "success" },
  FORMER: { label: "Voormalig", variant: "outline" },
};

type Sort = "name" | "city" | "status" | "updatedAt";
interface Filters {
  q: string;
  status: string;
  mine: boolean;
  noAction: boolean;
  archived: boolean;
}
const EMPTY: Filters = { q: "", status: "", mine: false, noAction: false, archived: false };
const PRESETS: { label: string; filters: Filters }[] = [
  { label: "Alle sponsoren", filters: EMPTY },
  { label: "Mijn sponsoren", filters: { ...EMPTY, mine: true } },
  { label: "Geen vervolgactie", filters: { ...EMPTY, noAction: true } },
  { label: "Archief", filters: { ...EMPTY, archived: true } },
];
const SAVED_KEY = "commercieel.sponsoren.filters";

function loadSaved(): { name: string; filters: Filters }[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function SponsorList({ canCreate }: { canCreate: boolean }) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<Sort>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState<{ name: string; filters: Filters }[]>([]);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ sort, dir, page: String(page) });
    if (filters.q) p.set("q", filters.q);
    if (filters.status) p.set("status", filters.status);
    if (filters.mine) p.set("mine", "1");
    if (filters.noAction) p.set("noAction", "1");
    if (filters.archived) p.set("archived", "1");
    const r = await api<ListResult>(`/api/commercial/companies?${p}`);
    setLoading(false);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, [filters, sort, dir, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  function apply(f: Filters) {
    setFilters(f);
    setPage(1);
  }
  function toggleSort(s: Sort) {
    if (sort === s) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(s);
      setDir("asc");
    }
  }
  function saveCurrent() {
    const name = window.prompt("Naam voor deze selectie?");
    if (!name?.trim()) return;
    const next = [...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), filters }];
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* opslag niet beschikbaar: de selectie blijft alleen in deze sessie */
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sortHead = (s: Sort, children: React.ReactNode) => (
    <th scope="col" className="px-3 py-2 text-left font-medium" aria-sort={sort === s ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1" onClick={() => toggleSort(s)}>
        {children}
        {sort === s && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sponsoren</h1>
          <p className="text-sm text-muted-foreground">Eén dossier per bedrijf: potentiële, actieve en voormalige sponsoren.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> Nieuw bedrijf
          </Button>
        )}
      </div>

      {creating && <NewCompany onCancel={() => setCreating(false)} />}

      <div className="flex flex-wrap gap-2">
        {[...PRESETS, ...saved.map((s) => ({ label: s.name, filters: s.filters }))].map((p) => (
          <button
            key={p.label}
            onClick={() => apply(p.filters)}
            className={`rounded-full border px-3 py-1 text-sm ${JSON.stringify(p.filters) === JSON.stringify(filters) ? "border-primary bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label htmlFor="q">Zoeken</Label>
          <Input id="q" placeholder="Naam, plaats of KvK" value={filters.q} onChange={(e) => apply({ ...filters, q: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <select id="status" className="h-10 rounded-md border border-border bg-surface px-2 text-sm" value={filters.status} onChange={(e) => apply({ ...filters, status: e.target.value })}>
            <option value="">Alle</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={saveCurrent}>Selectie opslaan</Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {sortHead("name", "Sponsor")}
                {sortHead("status", "Status")}
                {sortHead("city", "Plaats")}
                <th scope="col" className="px-3 py-2 text-left font-medium">Verantwoordelijke</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Laatste contact</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Volgende actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted/50">
                  <td className="px-3 py-2">
                    <Link href={`/commercieel/sponsoren/${r.id}`} className="font-medium text-hhc-orange-dark hover:underline">{r.name}</Link>
                    {r.tradeName && <div className="text-xs text-muted-foreground">{r.tradeName}</div>}
                  </td>
                  <td className="px-3 py-2"><Badge variant={STATUS[r.status]?.variant ?? "outline"}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                  <td className="px-3 py-2">{r.city ?? "–"}</td>
                  <td className="px-3 py-2">{r.ownerName ?? "–"}</td>
                  <td className="px-3 py-2">{formatDate(r.lastContactAt)}</td>
                  <td className="px-3 py-2">
                    {r.openTasks === 0 ? <span className="text-muted-foreground">Geen vervolgactie</span> : `${r.openTasks} open${r.nextActionDue ? ` · ${formatDate(r.nextActionDue)}` : ""}`}
                  </td>
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {filters.q || filters.status || filters.mine || filters.noAction ? "Geen sponsoren gevonden voor deze selectie." : "Er zijn nog geen sponsoren. Voeg het eerste bedrijf toe."}
                  </td>
                </tr>
              )}
              {!data && loading && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Laden…</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} sponsor{data.total === 1 ? "" : "en"}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Vorige</Button>
            <span>Pagina {page} van {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Volgende</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewCompany({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [kvk, setKvk] = useState("");
  const [status, setStatus] = useState("PROSPECT");
  const [dups, setDups] = useState<{ visible: { id: string; name: string; city: string | null; archived: boolean }[]; hiddenCount: number } | null>(null);
  const [saving, setSaving] = useState(false);

  async function check() {
    if (!name.trim()) return setDups(null);
    const r = await api<NonNullable<typeof dups>>("/api/commercial/companies/duplicates", "POST", { name, kvkNumber: kvk || null });
    if (r.ok) setDups(r.data);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await api<{ id: string }>("/api/commercial/companies", "POST", { name, city: city || null, kvkNumber: kvk || null, status });
    setSaving(false);
    if (r.ok) {
      toast.success("Bedrijf aangemaakt.");
      router.push(`/commercieel/sponsoren/${r.data.id}`);
    } else toast.error(r.error);
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <h2 className="font-semibold">Nieuw bedrijf</h2>
          <p className="text-sm text-muted-foreground">Alleen de naam is verplicht; de rest kun je later aanvullen.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="nc-name">Bedrijfsnaam</Label>
              <Input id="nc-name" required value={name} onChange={(e) => setName(e.target.value)} onBlur={check} />
            </div>
            <div>
              <Label htmlFor="nc-city">Plaats</Label>
              <Input id="nc-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="nc-kvk">KvK-nummer</Label>
              <Input id="nc-kvk" value={kvk} onChange={(e) => setKvk(e.target.value)} onBlur={check} />
            </div>
            <div>
              <Label htmlFor="nc-status">Status</Label>
              <select id="nc-status" className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          {dups && (dups.visible.length > 0 || dups.hiddenCount > 0) && (
            <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <strong>Mogelijk bestaat dit bedrijf al.</strong>
              <ul className="mt-1 list-disc pl-5">
                {dups.visible.map((d) => (
                  <li key={d.id}><Link className="underline" href={`/commercieel/sponsoren/${d.id}`}>{d.name}{d.city ? ` (${d.city})` : ""}</Link>{d.archived ? " – gearchiveerd" : ""}</li>
                ))}
                {dups.hiddenCount > 0 && <li>{dups.hiddenCount} bestaand dossier buiten jouw bereik. Vraag de verantwoordelijke of een beheerder.</li>}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Opslaan…" : "Aanmaken"}</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
