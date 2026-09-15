"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea, Checkbox } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const CATEGORY_SUGGESTIONS = [
  "Design",
  "Sponsoring",
  "Vrijwilligers",
  "Communicatie",
  "Social media",
  "Magazine",
  "Wedstrijden",
];

interface NewsPost {
  id: string;
  title: string;
  body: string;
  category: string | null;
  pinned: boolean;
  createdAt: string;
  author: { name: string } | null;
}

export default function AdminNieuwsPage() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("");

  async function load() {
    const res = await fetch("/api/admin/news");
    const data = await res.json();
    setPosts(data.posts ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title || !body) return;
    const res = await fetch("/api/admin/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, category: category || null, pinned }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Plaatsen mislukt.");
      return;
    }
    setTitle("");
    setBody("");
    setCategory("");
    setPinned(false);
    await load();
  }

  async function togglePinned(post: NewsPost) {
    await fetch(`/api/admin/news/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !post.pinned }),
    });
    await load();
  }

  function startEdit(post: NewsPost) {
    setEditId(post.id);
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditCategory(post.category ?? "");
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/news/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, body: editBody, category: editCategory || null }),
    });
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Dit nieuwsbericht verwijderen?")) return;
    await fetch(`/api/admin/news/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Nieuws</h1>
        <p className="mt-1 text-muted-foreground">
          Interne nieuwsberichten voor Team Communicatie. Belangrijke berichten kun je vastzetten bovenaan.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuw bericht plaatsen</p>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Nieuw sponsorenlogo beschikbaar" />
            </div>
            <div>
              <Label>Categorie</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optioneel" list="news-categories" />
              <datalist id="news-categories">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <Label>Tekst</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} id="new-pinned" />
              <Label htmlFor="new-pinned" className="mb-0">
                Vastzetten bovenaan
              </Label>
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" className="w-fit sm:col-span-2">
              Plaatsen
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <Card key={post.id} className={post.pinned ? "border-hhc-orange" : undefined}>
            <CardContent className="p-4">
              {editId === post.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} list="news-categories" />
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(post.id)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.pinned && <Badge variant="primary">Vastgezet</Badge>}
                      {post.category && <Badge variant="outline">{post.category}</Badge>}
                      <p className="font-medium">{post.title}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        className={`flex items-center gap-1 text-xs hover:underline ${post.pinned ? "text-hhc-orange-dark" : "text-muted-foreground"}`}
                        onClick={() => togglePinned(post)}
                      >
                        <Pin className="h-3.5 w-3.5" />
                        {post.pinned ? "losmaken" : "vastzetten"}
                      </button>
                      <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(post)}>
                        bewerken
                      </button>
                      <button className="text-xs text-destructive hover:underline" onClick={() => remove(post.id)}>
                        verwijderen
                      </button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{post.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(post.createdAt), "d MMMM yyyy", { locale: nl })}
                    {post.author?.name ? ` · ${post.author.name}` : ""}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {posts.length === 0 && <p className="text-sm text-muted-foreground">Nog geen nieuwsberichten.</p>}
      </div>
    </div>
  );
}
