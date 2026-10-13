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
import { TierBadge, TierSelect } from "@/components/commercial/sponsor-tier";
import { ActivityList, KIND, NATURE } from "@/components/commercial/activity-list";
import { FilesTab } from "./files-tab";
import { MergePanel } from "./merge-panel";
import { ContractsTab } from "./contracts-tab";

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
  sponsorTier: string | null;
  source: string | null;
  internalNotes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  archivedAt: string | null;
  ownerOptions: { id: string; name: string }[];
  canChangeOwner: boolean;
}
interface Contact { id: string; name: string; jobTitle: string | null; email: string | null; phone: string | null; role: string | null; notes: string | null }
interface Task { id: string; title: string; status: "OPEN" | "DONE"; dueAt: string | null; assigneeName: string | null; version: number }

const STATUS: Record<string, string> = { PROSPECT: "Potentieel", ACTIVE: "Actief", FORMER: "Voormalig" };

type Tab = "overview" | "contacts" | "history" | "tasks" | "contracts" | "files";

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
    { key: "contracts", label: "Contracten", show: can("contracts:read") },
    { key: "files", label: "Bestanden", show: can("files:read") },
  ];

  return (
    <div className="space-y-5">
      <Link href="/commercieel/sponsoren" className="inline-flex items-center gap-1 text-sm text-hhc-orange-dark"><ArrowLeft className="h-4 w-4" /> Alle sponsoren</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{company.name}</h1>
        <Badge variant={company.status === "ACTIVE" ? "success" : company.status === "PROSPECT" ? "primary" : "outline"}>{STATUS[company.status] ?? company.status}</Badge>
        {company.sponsorTier && <TierBadge tier={company.sponsorTier} />}
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
      {tab === "overview" && can("companies:update") && can("companies:archive") && !company.archivedAt && <MergePanel companyId={id} companyName={company.name} onDone={load} />}
      {tab === "contacts" && <Contacts companyId={id} can={can} />}
      {tab === "history" && <History companyId={id} can={can} />}
      {tab === "tasks" && <CompanyTasks companyId={id} can={can} />}
      {tab === "contracts" && <ContractsTab companyId={id} can={can} />}
      {tab === "files" && <FilesTab companyId={id} can={can} />}
    </div>
  );
}

const FIELD_LABELS: [keyof Company, string][] = [
  ["name", "Bedrijfsnaam"], ["tradeName", "Handelsnaam"], ["street", "Adres"], ["postalCode", "Postcode"], ["city", "Plaats"], ["country", "Land"],
  ["website", "Website"], ["email", "Algemeen e-mailadres"], ["phone", "Telefoon"], ["kvkNumber", "KvK-nummer"], ["vatNumber", "Btw-nummer"],
  ["billingName", "Factuur t.a.v."], ["billingEmail", "Factuur e-mailadres"], ["industry", "Branche"], ["sponsorCategory", "Overige categorie (vrije tekst)"], ["source", "Herkomst van de relatie"],
];

function Overview({ company, canEdit, canArchive, onSaved }: { company: Company; canEdit: boolean; canArchive: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const f: Record<string, string> = {};
    for (const [k] of FIELD_LABELS) f[k] = (company[k] as string | null) ?? "";
    f.status = company.status;
    f.sponsorTier = company.sponsorTier ?? "";
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
    body.sponsorTier = form.sponsorTier || null;
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
            <Label htmlFor="f-tier">Sponsorvorm</Label>
            <TierSelect id="f-tier" value={form.sponsorTier ?? ""} onChange={(v) => setForm((f) => ({ ...f, sponsorTier: v }))} disabled={!canEdit} />
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

const CONTACT_FIELDS = [["name", "Naam"], ["jobTitle", "Functie"], ["email", "E-mailadres"], ["phone", "Telefoon"], ["role", "Contactrol (bijv. beslisser, facturatie)"]] as const;
type ContactForm = Record<(typeof CONTACT_FIELDS)[number][0], string>;
const EMPTY_CONTACT: ContactForm = { name: "", jobTitle: "", email: "", phone: "", role: "" };
const ordinal = (i: number) => (i === 0 ? "Eerste contactpersoon" : i === 1 ? "Tweede contactpersoon" : i === 2 ? "Derde contactpersoon" : `${i + 1}e contactpersoon`);

function Contacts({ companyId, can }: { companyId: string; can: (p: Permission) => boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<ContactForm>(EMPTY_CONTACT);
  const [busy, setBusy] = useState(false);
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
      setForm(EMPTY_CONTACT);
      toast.success("Contactpersoon toegevoegd.");
      await load();
    } else toast.error(r.error);
  }
  async function archive(id: string) {
    const r = await api(`/api/commercial/contacts/${id}`, "DELETE");
    if (r.ok) await load();
    else toast.error(r.error);
  }
  function startEdit(c: Contact) {
    setEditing(c.id);
    setEdit({ name: c.name, jobTitle: c.jobTitle ?? "", email: c.email ?? "", phone: c.phone ?? "", role: c.role ?? "" });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const r = await api(`/api/commercial/contacts/${editing}`, "PUT", edit);
    if (r.ok) {
      setEditing(null);
      toast.success("Contactpersoon bijgewerkt.");
      await load();
    } else toast.error(r.error);
  }
  async function move(index: number, delta: -1 | 1) {
    if (!rows) return;
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setBusy(true);
    setRows(next);
    const r = await api(`/api/commercial/companies/${companyId}/contacts`, "PUT", { order: next.map((c) => c.id) });
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    await load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {rows === null ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nog geen contactpersonen.</p> : (
            <ol className="divide-y divide-border">
              {rows.map((c, i) => (
                <li key={c.id} className="p-4 text-sm">
                  {editing === c.id ? (
                    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
                      {CONTACT_FIELDS.map(([k, label]) => (
                        <div key={k}>
                          <Label htmlFor={`e-${k}`}>{label}</Label>
                          <Input id={`e-${k}`} required={k === "name"} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                        </div>
                      ))}
                      <div className="flex gap-2 sm:col-span-2">
                        <Button type="submit" size="sm">Opslaan</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Annuleren</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ordinal(i)}</div>
                        <div className="font-medium">{c.name}{c.jobTitle && <span className="font-normal text-muted-foreground"> · {c.jobTitle}</span>}{c.role && <Badge className="ml-2" variant="outline">{c.role}</Badge>}</div>
                        <div className="text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "Geen contactgegevens"}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {can("contacts:update") && rows.length > 1 && (
                          <>
                            <Button variant="ghost" size="sm" disabled={busy || i === 0} aria-label={`${c.name} omhoog`} title="Omhoog" onClick={() => move(i, -1)}>↑</Button>
                            <Button variant="ghost" size="sm" disabled={busy || i === rows.length - 1} aria-label={`${c.name} omlaag`} title="Omlaag" onClick={() => move(i, 1)}>↓</Button>
                          </>
                        )}
                        {can("contacts:update") && <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>Bewerken</Button>}
                        {can("contacts:archive") && <Button variant="ghost" size="sm" onClick={() => archive(c.id)}>Archiveren</Button>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
      {can("contacts:create") && (
        <Card>
          <CardHeader><CardTitle>Contactpersoon toevoegen</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Een nieuwe contactpersoon komt onderaan de volgorde. Met de pijltjes zet je iemand hoger of lager.</p>
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
              {CONTACT_FIELDS.map(([k, label]) => (
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
  const [reloadKey, setReloadKey] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const empty = { kind: "CALL", nature: "NOTE", occurredAt: toLocalInput(), isPlanned: false, summary: "", followUp: "", contactId: "", taskTitle: "", taskDue: "" };
  const [form, setForm] = useState(empty);
  const load = useCallback(async () => {
    if (can("contacts:read")) {
      const c = await api<{ contacts: Contact[] }>(`/api/commercial/companies/${companyId}/contacts`);
      if (c.ok) setContacts(c.data.contacts);
    }
  }, [companyId, can]);
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
      setReloadKey((k) => k + 1);
    } else toast.error(r.error);
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
      <ActivityList companyId={companyId} can={can} reloadKey={reloadKey} />
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
