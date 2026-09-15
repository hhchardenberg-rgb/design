"use client";

import { useEffect, useState } from "react";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

interface StockPhoto {
  id: string;
  title: string;
  category: string;
  url: string;
  width: number | null;
  height: number | null;
}

export default function AdminFotobankPage() {
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("algemeen");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");

  async function load() {
    const res = await fetch("/api/admin/stock-photos");
    const data = await res.json();
    setPhotos(data.photos ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("category", category);
      const res = await fetch("/api/admin/stock-photos", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Uploaden mislukt.");
        return;
      }
      setTitle("");
      setFile(null);
      await load();
    } finally {
      setLoading(false);
    }
  }

  function startEdit(p: StockPhoto) {
    setEditId(p.id);
    setEditTitle(p.title);
    setEditCategory(p.category);
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/stock-photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, category: editCategory }),
    });
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Deze foto verwijderen?")) return;
    await fetch(`/api/admin/stock-photos/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Fotobank</h1>
        <p className="mt-1 text-muted-foreground">
          Standaardfoto&apos;s die alle vrijwilligers kunnen bekijken en downloaden via de fotobank in de hub.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={upload} className="grid gap-3 sm:grid-cols-[1fr_160px_auto_auto] sm:items-end">
            <div>
              <Label htmlFor="phototitle">Titel</Label>
              <Input id="phototitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Clublogo op groen veld" />
            </div>
            <div>
              <Label htmlFor="photocategory">Categorie</Label>
              <Input id="photocategory" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="algemeen" />
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              {file ? file.name : "Bestand kiezen"}
              <input type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Button type="submit" disabled={loading} className="w-fit">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Uploaden"}
            </Button>
            {error && <p className="text-sm text-destructive sm:col-span-4">{error}</p>}
            <p className="text-xs text-muted-foreground sm:col-span-4">Max 4MB per foto (PNG, JPG of WebP).</p>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {photos.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="aspect-square bg-surface-muted bg-cover bg-center" style={{ backgroundImage: `url(${p.url})` }} />
            <CardContent className="p-3">
              {editId === p.id ? (
                <div className="flex flex-col gap-2">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8 text-sm" />
                  <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="h-8 text-sm" />
                  <div className="flex gap-2">
                    <button className="text-xs font-medium text-hhc-orange-dark hover:underline" onClick={() => saveEdit(p.id)}>
                      opslaan
                    </button>
                    <button className="text-xs text-muted-foreground hover:underline" onClick={() => setEditId(null)}>
                      annuleren
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(p)}>
                      bewerken
                    </button>
                    <button className="text-destructive" onClick={() => remove(p.id)} aria-label="Verwijderen">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {photos.length === 0 && <p className="text-sm text-muted-foreground">Nog geen foto&apos;s geüpload.</p>}
      </div>
    </div>
  );
}
