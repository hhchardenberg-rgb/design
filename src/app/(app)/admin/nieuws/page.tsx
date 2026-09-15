"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pin, Upload } from "lucide-react";
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
  imageUrl: string | null;
  createdAt: string;
  author: { name: string } | null;
}

export default function AdminNieuwsPage() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [pinned, setPinned] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);

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
    const form = new FormData();
    form.set("title", title);
    form.set("body", body);
    form.set("category", category);
    form.set("pinned", String(pinned));
    if (image) form.set("image", image);

    const res = await fetch("/api/admin/news", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Plaatsen mislukt.");
      return;
    }
    setTitle("");
    setBody("");
    setCategory("");
    setPinned(false);
    setImage(null);
    await load();
  }

  async function togglePinned(post: NewsPost) {
    const form = new FormData();
    form.set("pinned", String(!post.pinned));
    await fetch(`/api/admin/news/${post.id}`, { method: "PATCH", body: form });
    await load();
  }

  function startEdit(post: NewsPost) {
    setEditId(post.id);
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditCategory(post.category ?? "");
    setEditImage(null);
    setEditRemoveImage(false);
  }

  async function saveEdit(id: string) {
    const form = new FormData();
    form.set("title", editTitle);
    form.set("body", editBody);
    form.set("category", editCategory);
    if (editImage) form.set("image", editImage);
    if (editRemoveImage) form.set("removeImage", "true");

    await fetch(`/api/admin/news/${id}`, { method: "PATCH", body: form });
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
            <div className="sm:col-span-2">
              <Label>Afbeelding (optioneel)</Label>
              <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                {image ? image.name : "Bestand kiezen"}
                <input type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
              </label>
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
                  <div>
                    <Label>Afbeelding</Label>
                    {post.imageUrl && !editRemoveImage && (
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-16 w-16 rounded bg-cover bg-center" style={{ backgroundImage: `url(${post.imageUrl})` }} />
                        <button type="button" className="text-xs text-destructive hover:underline" onClick={() => setEditRemoveImage(true)}>
                          afbeelding verwijderen
                        </button>
                      </div>
                    )}
                    <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                      <Upload className="h-4 w-4" />
                      {editImage ? editImage.name : "Nieuwe afbeelding kiezen"}
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                          setEditImage(e.target.files?.[0] ?? null);
                          setEditRemoveImage(false);
                        }}
                      />
                    </label>
                  </div>
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
                <div className="flex gap-3">
                  {post.imageUrl && (
                    <div className="h-20 w-20 shrink-0 rounded bg-cover bg-center" style={{ backgroundImage: `url(${post.imageUrl})` }} />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
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
