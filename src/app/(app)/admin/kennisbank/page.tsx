"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface KnowledgeArticle {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
}

export default function AdminKennisbankPage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editBody, setEditBody] = useState("");

  async function load() {
    const res = await fetch("/api/admin/knowledge");
    const data = await res.json();
    setArticles(data.articles ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title) return;
    const res = await fetch("/api/admin/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category: category || null, body: body || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Toevoegen mislukt.");
      return;
    }
    setTitle("");
    setCategory("");
    setBody("");
    await load();
  }

  function startEdit(a: KnowledgeArticle) {
    setEditId(a.id);
    setEditTitle(a.title);
    setEditCategory(a.category ?? "");
    setEditBody(a.body ?? "");
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, category: editCategory || null, body: editBody || null }),
    });
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Deze handleiding verwijderen?")) return;
    await fetch(`/api/admin/knowledge/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Kennisbank</h1>
        <p className="mt-1 text-muted-foreground">
          Handleidingen en werkwijzen voor Team Communicatie — de interne HHC Communicatie-wiki.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuwe handleiding toevoegen</p>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Hoe plaats ik een artikel?" />
            </div>
            <div>
              <Label>Categorie</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optioneel" />
            </div>
            <div className="sm:col-span-2">
              <Label>Inhoud</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Laat leeg om de titel als 'nog te schrijven' te laten zien." />
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" className="w-fit sm:col-span-2">
              Toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {articles.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4">
              {editId === a.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Categorie" />
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(a.id)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.category && <Badge variant="outline">{a.category}</Badge>}
                      <p className="font-medium">{a.title}</p>
                      {!a.body && <Badge variant="outline">nog te schrijven</Badge>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(a)}>
                        bewerken
                      </button>
                      <button className="text-xs text-destructive hover:underline" onClick={() => remove(a.id)}>
                        verwijderen
                      </button>
                    </div>
                  </div>
                  {a.body && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {articles.length === 0 && <p className="text-sm text-muted-foreground">Nog geen handleidingen toegevoegd.</p>}
      </div>
    </div>
  );
}
