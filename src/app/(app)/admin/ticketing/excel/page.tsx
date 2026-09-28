"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, FileSpreadsheet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";

interface ExcelTemplate {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  url: string;
  fileName: string;
  fileSize: number | null;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminTicketingExcelPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<ExcelTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");

  async function load() {
    const res = await fetch("/api/admin/ticketing/excel");
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file || !title) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("description", description);
      form.append("category", category);
      const res = await fetch("/api/admin/ticketing/excel", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Uploaden mislukt.");
        return;
      }
      setTitle("");
      setDescription("");
      setCategory("");
      setFile(null);
      await load();
      toast.success("Sjabloon geüpload.");
    } finally {
      setUploading(false);
    }
  }

  function startEdit(t: ExcelTemplate) {
    setEditId(t.id);
    setEditTitle(t.title);
    setEditDescription(t.description ?? "");
    setEditCategory(t.category ?? "");
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/ticketing/excel/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, description: editDescription || null, category: editCategory || null }),
    });
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Dit sjabloon verwijderen?")) return;
    const res = await fetch(`/api/admin/ticketing/excel/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Verwijderen mislukt.");
      return;
    }
    toast.success("Sjabloon verwijderd.");
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/ticketing" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Ticketing
        </Link>
        <h1 className="text-2xl font-bold">Excel-sjablonen</h1>
        <p className="mt-1 text-muted-foreground">
          Standaard Excel-bestanden om te downloaden en te gebruiken bij het ticketingsysteem, zichtbaar voor
          iedereen met de rol Ticketing.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuw sjabloon uploaden</p>
          <form onSubmit={upload} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Ledenlijst importformaat" />
            </div>
            <div>
              <Label>Categorie</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optioneel" />
            </div>
            <div className="sm:col-span-2">
              <Label>Toelichting</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optioneel" />
            </div>
            <div className="sm:col-span-2">
              <Label>Bestand</Label>
              <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                {file ? file.name : "Bestand kiezen"}
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">XLSX, XLS of CSV.</p>
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" disabled={uploading} className="w-fit sm:col-span-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Uploaden"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardContent className="p-4">
              {editId === t.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titel" />
                  <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Categorie" />
                  <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} placeholder="Toelichting" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(t.id)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-hhc-orange-dark">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {t.category && <Badge variant="outline">{t.category}</Badge>}
                        <p className="font-medium">{t.title}</p>
                      </div>
                      {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.fileName}
                        {t.fileSize ? ` · ${formatSize(t.fileSize)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <a href={t.url} download className="flex items-center gap-1 text-xs text-hhc-orange-dark hover:underline">
                      <Download className="h-3.5 w-3.5" />
                      downloaden
                    </a>
                    <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(t)}>
                      bewerken
                    </button>
                    <button className="text-xs text-destructive hover:underline" onClick={() => remove(t.id)}>
                      verwijderen
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {loaded && templates.length === 0 && <p className="text-sm text-muted-foreground">Nog geen sjablonen geüpload.</p>}
      </div>
    </div>
  );
}
