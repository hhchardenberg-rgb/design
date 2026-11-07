"use client";

import { shrinkImageForUpload } from "@/lib/client/shrink-image";
import { useEffect, useState } from "react";
import { ClipboardPaste, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";

interface Contact {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  photoUrl: string | null;
}

const emptyForm = { name: "", role: "", email: "", phone: "", notes: "" };

interface ImportPreviewRow {
  line: number;
  role: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: "nieuw" | "bestaat";
}

interface ImportResult {
  preview: ImportPreviewRow[];
  errors: { line: number; text: string; reason: string }[];
}

export default function AdminContactpersonenPage() {
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editRemovePhoto, setEditRemovePhoto] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function runImport(dryRun: boolean) {
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await fetch("/api/admin/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportError(data.error ?? "Inlezen mislukt.");
        return;
      }
      if (dryRun) {
        setImportPreview(data);
        return;
      }
      const created = data.created ?? 0;
      const skipped = data.skipped ?? 0;
      toast.success(
        `${created} contactperso${created === 1 ? "on" : "nen"} toegevoegd` + (skipped ? `, ${skipped} overgeslagen (bestond al).` : ".")
      );
      setImportText("");
      setImportPreview(null);
      setImportOpen(false);
      await load();
    } finally {
      setImportBusy(false);
    }
  }

  const importNewCount = importPreview?.preview.filter((r) => r.status === "nieuw").length ?? 0;

  async function load() {
    const res = await fetch("/api/admin/contacts");
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name || !form.role) return;
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.set(k, v));
    if (photo) body.set("photo", await shrinkImageForUpload(photo));

    const res = await fetch("/api/admin/contacts", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Toevoegen mislukt.");
      return;
    }
    setForm(emptyForm);
    setPhoto(null);
    toast.success("Contactpersoon toegevoegd.");
    await load();
  }

  function startEdit(c: Contact) {
    setEditId(c.id);
    setEditForm({ name: c.name, role: c.role, email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "" });
    setEditPhoto(null);
    setEditRemovePhoto(false);
  }

  async function saveEdit(id: string) {
    const body = new FormData();
    Object.entries(editForm).forEach(([k, v]) => body.set(k, v));
    if (editPhoto) body.set("photo", await shrinkImageForUpload(editPhoto));
    if (editRemovePhoto) body.set("removePhoto", "true");

    const res = await fetch(`/api/admin/contacts/${id}`, { method: "PATCH", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Opslaan mislukt.");
      return;
    }
    setEditId(null);
    toast.success("Wijzigingen opgeslagen.");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Deze contactpersoon verwijderen?")) return;
    const res = await fetch(`/api/admin/contacts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Verwijderen mislukt.");
      return;
    }
    toast.success("Contactpersoon verwijderd.");
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Contactpersonen</h1>
        <p className="mt-1 text-muted-foreground">Wie doet wat binnen HHC Hardenberg en hoe bereik je elkaar?</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuwe contactpersoon toevoegen</p>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Naam</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Functie</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Bijv. Coördinator social media" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefoon</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notities (optioneel)</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Bijv. bereikbaarheid of aandachtsgebied" />
            </div>
            <div className="sm:col-span-2">
              <Label>Foto (optioneel)</Label>
              <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                {photo ? photo.name : "Bestand kiezen"}
                <input type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" className="w-fit sm:col-span-2">
              Toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">Lijst plakken</p>
              <p className="text-sm text-muted-foreground">Voeg meerdere contactpersonen tegelijk toe vanuit Excel, Word of een mail.</p>
            </div>
            {!importOpen && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <ClipboardPaste className="h-4 w-4" />
                Lijst plakken
              </Button>
            )}
          </div>
          {importOpen && (
            <div className="flex flex-col gap-3">
              <div>
                <Label>Eén persoon per regel: functie, naam en telefoon</Label>
                <Textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportPreview(null);
                  }}
                  rows={8}
                  placeholder={"Voorzitter\tJan Jansen +31 6 12345678\nSecretaris; Anna Smit; 06 12345678"}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Kolommen gescheiden door een tab (zoals uit Excel) of een puntkomma. Namen die er al staan worden overgeslagen en niet gewijzigd.
                </p>
              </div>
              {importError && <p className="text-sm text-destructive">{importError}</p>}
              {importPreview && (
                <div className="flex flex-col gap-2">
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-muted text-left text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Functie</th>
                          <th className="px-3 py-2 font-medium">Naam</th>
                          <th className="px-3 py-2 font-medium">Telefoon</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.preview.map((r) => (
                          <tr key={r.line} className="border-t border-border">
                            <td className="px-3 py-2">{r.role}</td>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.phone ?? r.email ?? "–"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.status === "nieuw" ? (
                                <span className="text-hhc-orange-dark">Nieuw</span>
                              ) : (
                                <span className="text-muted-foreground">Bestaat al, wordt overgeslagen</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.errors.map((err) => (
                    <p key={err.line} className="text-sm text-destructive">
                      Regel {err.line} ({err.text}): {err.reason}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!importPreview ? (
                  <Button onClick={() => runImport(true)} disabled={importBusy || !importText.trim()}>
                    Voorbeeld bekijken
                  </Button>
                ) : (
                  <Button onClick={() => runImport(false)} disabled={importBusy || importNewCount === 0}>
                    {importNewCount === 0 ? "Niets nieuws om toe te voegen" : `${importNewCount} toevoegen`}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setImportOpen(false);
                    setImportPreview(null);
                    setImportError(null);
                  }}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {contacts.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              {editId === c.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Naam" />
                  <Input value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} placeholder="Functie" />
                  <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="E-mail" />
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Telefoon" />
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} placeholder="Notities" />
                  {c.photoUrl && !editRemovePhoto && (
                    <div className="flex items-center gap-2">
                      <div className="h-12 w-12 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${c.photoUrl})` }} />
                      <button type="button" className="text-xs text-destructive hover:underline" onClick={() => setEditRemovePhoto(true)}>
                        foto verwijderen
                      </button>
                    </div>
                  )}
                  <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                    <Upload className="h-4 w-4" />
                    {editPhoto ? editPhoto.name : "Nieuwe foto kiezen"}
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={(e) => {
                        setEditPhoto(e.target.files?.[0] ?? null);
                        setEditRemovePhoto(false);
                      }}
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(c.id)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div
                    className="h-14 w-14 shrink-0 rounded-full bg-surface-muted bg-cover bg-center"
                    style={c.photoUrl ? { backgroundImage: `url(${c.photoUrl})` } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-muted-foreground">{c.role}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(c)}>
                          bewerken
                        </button>
                        <button className="text-xs text-destructive hover:underline" onClick={() => remove(c.id)}>
                          verwijderen
                        </button>
                      </div>
                    </div>
                    {c.email && <p className="mt-1 text-sm">{c.email}</p>}
                    {c.phone && <p className="text-sm">{c.phone}</p>}
                    {c.notes && <p className="mt-1 text-sm text-muted-foreground">{c.notes}</p>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {loaded && contacts.length === 0 && <p className="text-sm text-muted-foreground">Nog geen contactpersonen toegevoegd.</p>}
      </div>
    </div>
  );
}
