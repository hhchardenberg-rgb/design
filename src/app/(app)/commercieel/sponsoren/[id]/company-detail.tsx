"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useStableToast as useToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, toLocalInput } from "@/lib/commercial/client";
import type { Permission } from "@/lib/commercial/permissions";

interface Company {
  id: string;
  version: number;
  name: string;
  tradeName: string | null;
  status: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  kvkNumber: string | null;
  vatNumber: string | null;
  billingName: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
  industry: string | null;
  tags: string[];
  sponsorCategory: string | null;
  source: string | null;
  internalNotes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  archivedAt: string | null;
  ownerOptions: { id: string; name: string }[];
  canChangeOwner: boolean;
}
interface Contact { id: string; name: string; jobTitle: string | null; email: string | null; phone: string | null; role: string | null; notes: string | null }
interface Activity { id: string; kind: string; nature: string; occurredAt: string; isPlanned: boolean; summary: string; followUp: string | null; contactName: string | null; authorName: string | null }
interface Task { id: string; title: string; status: "OPEN" | "DONE"; dueAt: string | null; assigneeName: string | null; version: number }

const KIND: Record<string, string> = { CALL: "Telefoongesprek", VISIT: "Bezoek", MEETING: "Afspraak", EMAIL: "E-mail", WHATSAPP: "WhatsApp (handmatig)", QUOTE: "Offerte", OTHER: "Overig" };
const NATURE: Record<string, string> = { NOTE: "Gespreksnotitie", PROVISIONAL: "Voorlopige toezegging", FORMAL: "Formele afspraak" };
const STATUS: Record<string, string> = { PROSPECT: "Potentieel", ACTIVE: "Actief", FORMER: "Voormalig" };

type Tab = "overview" | "contacts" | "history" | "tasks";

export function CompanyDetail({ id, permissions }: { id: string; permissions: Permission[] }) {
  const can = useCallback((p: Permission) => permissions.includes(p), [permissions]);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    const r = await api<Company>(`/api/commercial/companies/${id}`);
    if (r.ok) setCompany(r.data);
    else setError({ status: r.status, message: r.error });
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/commercieel/sponsoren" className="inline-flex items-center gap-1 text-sm text-hhc-orange-dark"><ArrowLeft className="h-4 w-4" /> Alle sponsoren</Link>
        <p role="alert" className="text-sm">{error.status === 404 ? "Dit dossier bestaat niet of valt buiten jouw bereik." : error.message}</p>
      </div>
    );
  }
  if (!company) return <p className="text-sm text-muted-foreground">Laden…</p>;

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "overview", label: "Overzicht", show: true },
    { key: "contacts", label: "Contactpersonen", show: can("contacts:read") },
    { key: "history", label: "Contacthistorie", show: can("history:read") },
    { key: "tasks", label: "Taken", show: can("tasks:read") },
  ];

  return (
    <div className="space-y-5">
      <Link href="/commercieel/sponsoren" className="inline-flex items-center gap-1 text-sm text-hhc-orange-dark"><ArrowLeft className="h-4 w-4" /> Alle sponsoren</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{company.name}</h1>
        <Badge variant={company.status === "ACTIVE" ? "success" : company.status === "PROSPECT" ? "primary" : "outline"}>{STATUS[company.status] ?? company.status}</Badge>
        {company.archivedAt && <Badge variant="outline">Gearchiveerd</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">Verantwoordelijke: {company.ownerName ?? "niemand"}</p>

      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`whitespace-nowrap px-3 py-2 text-sm font-medium ${tab === t.key ? "border-b-2 border-primary" : "text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview company={company} canEdit={can("companies:update")} canArchive={can("companies:archive")} onSaved={load} />}
      {tab === "contacts" && <Contacts companyId={id} can={can} />}
      {tab === "history" && <History companyId={id} can={can} />}
      {tab === "tasks" && <CompanyTasks companyId={id} can={can} />}
    </div>
  );
}

const FIELD_LABELS: [keyof Company, string][] = [
  ["name", "Bedrijfsnaam"], ["tradeName", "Handelsnaam"], ["street", "Adres"], ["postalCode", "Postcode"], ["city", "Plaats"], ["country", "Land"],
  ["website", "Website"], ["email", "Algemeen e-mailadres"], ["phone", "Telefoon"], ["kvkNumber", "KvK-nummer"], ["vatNumber", "Btw-nummer"],
  ["billingName", "Factuur t.a.v."], ["billingEmail", "Factuur e-mailadres"], ["industry", "Branche"], ["sponsorCategory", "Sponsorcategorie"], ["source", "Herkomst van de relatie"],
];

function Overview({ company, canEdit, canArchive, onSaved }: { company: Company; canEdit: boolean; canArchive: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const f: Record<string, string> = {};
    for (const [k] of FIELD_LABELS) f[k] = (company[k] as string | null) ?? "";
    f.status = company.status;
    f.billingAddress = company.billingAddress ?? "";
    f.internalNotes = company.internalNotes ?? "";
    f.tags = company.tags.join(", ");
    f.ownerId = company.ownerId ?? "";
    setForm(f);
  }, [company]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = { version: company.version, ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    delete body.ownerId;
    if (company.canChangeOwner && form.ownerId !== (company.ownerId ?? "")) body.ownerId = form.ownerId || null;
    const r = await api(`/api/commercial/companies/${company.id}`, "PUT", body);
    setSaving(false);
    if (r.ok) {
      toast.success("Dossier opgeslagen.");
      await onSaved();
    } else toast.error(r.error);
  }
  async function archive() {
    const r = await api(`/api/commercial/companies/${company.id}/archive`, "POST", { archived: !company.archivedAt });
    if (r.ok) {
      toast.success(company.archivedAt ? "Dossier hersteld." : "Dossier gearchiveerd.");
      await onSaved();
    } else toast.error(r.error);
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          {FIELD_LABELS.map(([k, label]) => (
            <div key={k}>
              <Label htmlFor={`f-${k}`}>{label}</Label>
              <Input id={`f-${k}`} value={form[k] ?? ""} onChange={set(k)} disabled={!canEdit} required={k === "name"} />
            </div>
          ))}
          <div>
            <Label htmlFor="f-status">Relatiestatus</Label>
            <select id="f-status" className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm disabled:opacity-60" value={form.status ?? ""} onChange={set("status")} disabled={!canEdit}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="f-owner">Verantwoordelijke</Label>
            {company.canChangeOwner ? (
              <select id="f-owner" className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={form.ownerId ?? ""} onChange={set("ownerId")}>
                <option value="">Niemand</option>
                {company.ownerOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <Input id="f-owner" value={company.ownerName ?? "Niemand"} disabled />
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-tags">Tags (gescheiden door komma&apos;s)</Label>
            <Input id="f-tags" value={form.tags ?? ""} onChange={set("tags")} disabled={!canEdit} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-billingAddress">Factuuradres (indien afwijkend)</Label>
            <Textarea id="f-billingAddress" value={form.billingAddress ?? ""} onChange={set("billingAddress")} disabled={!canEdit} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-notes">Interne opmerkingen</Label>
            <Textarea id="f-notes" value={form.internalNotes ?? ""} onChange={set("internalNotes")} disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {canEdit && <Button type="submit" disabled={saving}>{saving ? "Opslaan…" : "Opslaan"}</Button>}
        {canArchive && <Button type="button" variant="outline" onClick={archive}>{company.archivedAt ? "Dossier herstellen" : "Dossier archiveren"}</Button>}
      </div>
      {!canEdit && <p className="text-sm text-muted-foreground">Je kunt dit dossier bekijken maar niet wijzigen.</p>}
    </form>
  );
}

function Contacts({ companyId, can }: { companyId: string; can: (p: Permission) => boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [form, setForm] = useState({ name: "", jobTitle: "", email: "", phone: "", role: "" });
  const load = useCallback(async () => {
    const r = await api<{ contacts: Contact[] }>(`/api/commercial/companies/${companyId}/contacts`);
    if (r.ok) setRows(r.data.contacts);
    else toast.error(r.error);
  }, [companyId, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/commercial/companies/${companyId}/contacts`, "POST", form);
    if (r.ok) {
      setForm({ name: "", jobTitle: "", email: "", phone: "", role: "" });
      toast.success("Contactpersoon toegevoegd.");
      await load();
    } else toast.error(r.error);
  }
  async function archive(id: string) {
    const r = await api(`/api/commercial/contacts/${id}`, "DELETE");
    if (r.ok) await load();
    else toast.error(r.error);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {rows === null ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nog geen contactpersonen.</p> : (
            <ul className="divide-y divide-border">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                  <div>
                    <div className="font-medium">{c.name}{c.role && <Badge className="ml-2" variant="outline">{c.role}</Badge>}</div>
                    <div className="text-muted-foreground">{[c.jobTitle, c.email, c.phone].filter(Boolean).join(" · ") || "Geen gegevens"}</div>
                  </div>
                  {can("contacts:archive") && <Button variant="ghost" size="sm" onClick={() => archive(c.id)}>Archiveren</Button>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {can("contacts:create") && (
        <Card>
          <CardHeader><CardTitle>Contactpersoon toevoegen</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
              {([["name", "Naam"], ["jobTitle", "Functie"], ["email", "E-mailadres"], ["phone", "Telefoon"], ["role", "Contactrol (bijv. beslisser, facturatie)"]] as const).map(([k, label]) => (
                <div key={k}>
                  <Label htmlFor={`c-${k}`}>{label}</Label>
                  <Input id={`c-${k}`} required={k === "name"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="sm:col-span-2"><Button type="submit">Toevoegen</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function History({ companyId, can }: { companyId: string; can: (p: Permission) => boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const empty = { kind: "CALL", nature: "NOTE", occurredAt: toLocalInput(), isPlanned: false, summary: "", followUp: "", contactId: "", taskTitle: "", taskDue: "" };
  const [form, setForm] = useState(empty);
  const load = useCallback(async () => {
    const r = await api<{ activities: Activity[] }>(`/api/commercial/companies/${companyId}/activities`);
    if (r.ok) setRows(r.data.activities);
    else toast.error(r.error);
    if (can("contacts:read")) {
      const c = await api<{ contacts: Contact[] }>(`/api/commercial/companies/${companyId}/contacts`);
      if (c.ok) setContacts(c.data.contacts);
    }
  }, [companyId, toast, can]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      kind: form.kind,
      nature: form.nature,
      occurredAt: new Date(form.occurredAt).toISOString(),
      isPlanned: form.isPlanned,
      summary: form.summary,
      followUp: form.followUp || null,
      contactId: form.contactId || null,
      followUpTask: form.taskTitle.trim() ? { title: form.taskTitle, dueAt: form.taskDue ? new Date(form.taskDue).toISOString() : null } : null,
    };
    const r = await api(`/api/commercial/companies/${companyId}/activities`, "POST", body);
    if (r.ok) {
      setForm({ ...empty, occurredAt: toLocalInput() });
      toast.success("Contactmoment vastgelegd.");
      await load();
    } else toast.error(r.error);
  }
  async function archive(id: string) {
    const r = await api(`/api/commercial/activities/${id}`, "DELETE");
    if (r.ok) await load();
    else toast.error(r.error);
  }

  return (
    <div className="space-y-4">
      {can("history:create") && (
        <Card>
          <CardHeader><CardTitle>Contactmoment toevoegen</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="h-kind">Kanaal</Label>
                <select id="h-kind" className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="h-nature">Soort</Label>
                <select id="h-nature" className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })}>
                  {Object.entries(NATURE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="h-when">Datum en tijd</Label>
                <Input id="h-when" type="datetime-local" required value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="h-contact">Contactpersoon</Label>
                <select id="h-contact" className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
                  <option value="">Geen / onbekend</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" className="h-4 w-4 accent-hhc-orange" checked={form.isPlanned} onChange={(e) => setForm({ ...form, isPlanned: e.target.checked })} />
                Dit is een geplande afspraak (nog niet gebeurd)
              </label>
              <div className="sm:col-span-2">
                <Label htmlFor="h-summary">Samenvatting</Label>
                <Textarea id="h-summary" required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="h-follow">Vervolgactie (tekst)</Label>
                <Input id="h-follow" value={form.followUp} onChange={(e) => setForm({ ...form, followUp: e.target.value })} />
              </div>
              {can("tasks:create") && (
                <>
                  <div>
                    <Label htmlFor="h-task">Vervolgtaak aanmaken (titel, optioneel)</Label>
                    <Input id="h-task" value={form.taskTitle} onChange={(e) => setForm({ ...form, taskTitle: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="h-due">Deadline vervolgtaak</Label>
                    <Input id="h-due" type="datetime-local" value={form.taskDue} onChange={(e) => setForm({ ...form, taskDue: e.target.value })} />
                  </div>
                </>
              )}
              <div className="sm:col-span-2"><Button type="submit">Vastleggen</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0">
          {rows === null ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nog geen contactmomenten.</p> : (
            <ol className="divide-y divide-border">
              {rows.map((a) => (
                <li key={a.id} className="space-y-1 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{KIND[a.kind] ?? a.kind}</span>
                    <Badge variant={a.nature === "FORMAL" ? "success" : a.nature === "PROVISIONAL" ? "primary" : "outline"}>{NATURE[a.nature]}</Badge>
                    {a.isPlanned && <Badge variant="outline">Gepland</Badge>}
                    <span className="text-muted-foreground">{formatDate(a.occurredAt, true)}</span>
                    {can("history:archive") && <Button className="ml-auto" variant="ghost" size="sm" onClick={() => archive(a.id)}>Archiveren</Button>}
                  </div>
                  <p className="whitespace-pre-wrap">{a.summary}</p>
                  {a.followUp && <p className="text-muted-foreground">Vervolg: {a.followUp}</p>}
                  <p className="text-xs text-muted-foreground">{[a.contactName && `Met ${a.contactName}`, a.authorName && `Door ${a.authorName}`].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CompanyTasks({ companyId, can }: { companyId: string; can: (p: Permission) => boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Task[] | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const load = useCallback(async () => {
    const r = await api<{ rows: Task[] }>(`/api/commercial/tasks?companyId=${companyId}`);
    if (r.ok) setRows(r.data.rows);
    else toast.error(r.error);
  }, [companyId, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("/api/commercial/tasks", "POST", { title, companyId, dueAt: due ? new Date(due).toISOString() : null });
    if (r.ok) {
      setTitle("");
      setDue("");
      await load();
    } else toast.error(r.error);
  }
  async function toggle(t: Task) {
    const r = await api(`/api/commercial/tasks/${t.id}/done`, "POST", { done: t.status === "OPEN" });
    if (r.ok) await load();
    else toast.error(r.error);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {rows === null ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Geen taken bij dit dossier.</p> : (
            <ul className="divide-y divide-border">
              {rows.map((t) => (
                <li key={t.id} className="flex items-center gap-3 p-4 text-sm">
                  <input type="checkbox" aria-label={`Taak ${t.title} afronden`} className="h-4 w-4 accent-hhc-orange" checked={t.status === "DONE"} disabled={!can("tasks:update")} onChange={() => toggle(t)} />
                  <span className={t.status === "DONE" ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                  <span className="ml-auto text-muted-foreground">{[t.assigneeName, t.dueAt && formatDate(t.dueAt)].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {can("tasks:create") && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Label htmlFor="t-title">Nieuwe taak</Label><Input id="t-title" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label htmlFor="t-due">Deadline</Label><Input id="t-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <Button type="submit">Toevoegen</Button>
        </form>
      )}
    </div>
  );
}
