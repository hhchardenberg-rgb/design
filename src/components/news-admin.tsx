"use client";

import { shrinkImageForUpload } from "@/lib/client/shrink-image";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Pin, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea, Checkbox } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { NEWS_SECTIONS, NEWS_SECTION_KEYS, type NewsEnabledMap, type NewsRightsMap, type NewsSection } from "@/lib/news";

const CATEGORY_SUGGESTIONS = ["Design", "Sponsoring", "Vrijwilligers", "Communicatie", "Ticketing", "Social media", "Magazine", "Wedstrijden"];

interface NewsPost {
  id: string;
  title: string;
  body: string;
  category: string | null;
  pinned: boolean;
  imageUrl: string | null;
  sections: string[];
  createdAt: string;
  author: { name: string } | null;
}

function SectionChoice({
  sections,
  selected,
  onChange,
  idPrefix,
}: {
  sections: NewsSection[];
  selected: NewsSection[];
  onChange: (next: NewsSection[]) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {sections.map((s) => (
        <div key={s} className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${s}`}
            checked={selected.includes(s)}
            onChange={(e) => onChange(e.target.checked ? [...selected, s] : selected.filter((x) => x !== s))}
          />
          <Label htmlFor={`${idPrefix}-${s}`} className="mb-0">
            {NEWS_SECTIONS[s].label}
          </Label>
        </div>
      ))}
    </div>
  );
}

/**
 * De centrale nieuwsmodule (/admin/nieuws). Eén bericht kan bij meerdere onderdelen staan;
 * iedere beheerder publiceert, wijzigt en verwijdert alleen voor de onderdelen waarvoor die
 * rechten heeft, en zet het nieuws van die onderdelen aan of uit.
 */
export function NewsAdmin({ rights, enabled: initialEnabled }: { rights: NewsRightsMap; enabled: NewsEnabledMap }) {
  const toast = useToast();
  const creatable = NEWS_SECTION_KEYS.filter((s) => rights[s].canCreate);
  const updatable = NEWS_SECTION_KEYS.filter((s) => rights[s].canUpdate);
  const toggleable = NEWS_SECTION_KEYS.filter((s) => rights[s].canToggle);
  const managed = NEWS_SECTION_KEYS.filter((s) => rights[s].canCreate || rights[s].canUpdate || rights[s].canDelete);

  const [enabled, setEnabled] = useState(initialEnabled);
  const [savingToggle, setSavingToggle] = useState<NewsSection | null>(null);
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<NewsSection | "all">("all");
  const [sections, setSections] = useState<NewsSection[]>(creatable.slice(0, 1));
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
  const [editSections, setEditSections] = useState<NewsSection[]>([]);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);

  async function load() {
    const res = await fetch("/api/news");
    const data = await res.json();
    setPosts(data.posts ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  const postSections = (post: NewsPost) => post.sections.filter((s): s is NewsSection => s in NEWS_SECTIONS);
  const canEdit = (post: NewsPost) => postSections(post).some((s) => rights[s].canUpdate);
  const canRemove = (post: NewsPost) => postSections(post).some((s) => rights[s].canDelete);
  const visiblePosts = filter === "all" ? posts : posts.filter((p) => p.sections.includes(filter));

  async function toggleEnabled(section: NewsSection) {
    const next = !enabled[section];
    setSavingToggle(section);
    const res = await fetch("/api/news/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, enabled: next }),
    });
    setSavingToggle(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Opslaan mislukt.");
      return;
    }
    setEnabled({ ...enabled, [section]: next });
    toast.success(`Nieuws voor ${NEWS_SECTIONS[section].label} staat ${next ? "aan" : "uit"}.`);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title || !body) return;
    if (sections.length === 0) {
      setError("Kies minstens één onderdeel.");
      return;
    }
    const form = new FormData();
    form.set("title", title);
    form.set("body", body);
    form.set("category", category);
    form.set("pinned", String(pinned));
    for (const s of sections) form.append("sections", s);
    if (image) form.set("image", await shrinkImageForUpload(image));

    const res = await fetch("/api/news", { method: "POST", body: form });
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
    await fetch(`/api/news/${post.id}`, { method: "PATCH", body: form });
    await load();
  }

  function startEdit(post: NewsPost) {
    setEditId(post.id);
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditCategory(post.category ?? "");
    setEditSections(postSections(post).filter((s) => rights[s].canUpdate));
    setEditImage(null);
    setEditRemoveImage(false);
  }

  async function saveEdit(post: NewsPost) {
    const others = postSections(post).filter((s) => !rights[s].canUpdate);
    if (editSections.length === 0 && others.length === 0) {
      toast.error("Kies minstens één onderdeel.");
      return;
    }
    const form = new FormData();
    form.set("title", editTitle);
    form.set("body", editBody);
    form.set("category", editCategory);
    for (const s of editSections) form.append("sections", s);
    // Leeg "sections" betekent: weghalen bij al jouw onderdelen (de andere blijven staan).
    if (editSections.length === 0) form.set("sections", "");
    if (editImage) form.set("image", await shrinkImageForUpload(editImage));
    if (editRemoveImage) form.set("removeImage", "true");

    const res = await fetch(`/api/news/${post.id}`, { method: "PATCH", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Opslaan mislukt.");
      return;
    }
    setEditId(null);
    await load();
  }

  async function remove(post: NewsPost) {
    const mine = postSections(post).filter((s) => rights[s].canDelete);
    const others = postSections(post).filter((s) => !rights[s].canDelete);
    const label = (list: NewsSection[]) => list.map((s) => NEWS_SECTIONS[s].label).join(", ");
    const question =
      others.length === 0
        ? "Dit nieuwsbericht verwijderen?"
        : `Dit bericht weghalen bij ${label(mine)}? Bij ${label(others)} blijft het staan.`;
    if (!confirm(question)) return;
    const res = await fetch(`/api/news/${post.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Verwijderen mislukt.");
      return;
    }
    toast.success(data.deleted ? "Nieuwsbericht verwijderd." : `Bericht weggehaald bij ${label(mine)}.`);
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Nieuws</h1>
        <p className="mt-1 text-muted-foreground">
          Eén nieuwsmodule voor alle onderdelen. Een bericht kan bij meerdere onderdelen staan en is alleen zichtbaar voor wie toegang
          heeft tot dat onderdeel. Je publiceert bij de onderdelen die jij beheert.
        </p>
      </div>

      {toggleable.length > 0 && (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {toggleable.map((s) => (
              <div key={s} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    Nieuws voor {NEWS_SECTIONS[s].label} staat {enabled[s] ? "aan" : "uit"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {enabled[s]
                      ? "Berichten zijn zichtbaar op de nieuwspagina en de startpagina van dit onderdeel."
                      : "De nieuwspagina, de nieuwskaarten en de menulink van dit onderdeel zijn verborgen. Berichten blijven bewaard."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled[s]}
                  aria-label={`Nieuws voor ${NEWS_SECTIONS[s].label}`}
                  disabled={savingToggle === s}
                  onClick={() => toggleEnabled(s)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
                    enabled[s] ? "bg-hhc-orange" : "bg-border"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                      enabled[s] ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {creatable.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <p className="font-medium">Nieuw bericht plaatsen</p>
            <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Plaatsen bij</Label>
                <SectionChoice sections={creatable} selected={sections} onChange={setSections} idPrefix="new" />
              </div>
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
      )}

      {managed.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {(["all", ...managed] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1",
                filter === f ? "border-hhc-orange bg-hhc-orange text-hhc-white" : "border-border text-muted-foreground hover:bg-surface-muted"
              )}
            >
              {f === "all" ? "Alle onderdelen" : NEWS_SECTIONS[f].label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {visiblePosts.map((post) => {
          const others = postSections(post).filter((s) => !rights[s].canUpdate);
          return (
            <Card key={post.id} className={post.pinned ? "border-hhc-orange" : undefined}>
              <CardContent className="p-4">
                {editId === post.id ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label>Plaatsen bij</Label>
                      <SectionChoice sections={updatable} selected={editSections} onChange={setEditSections} idPrefix={`edit-${post.id}`} />
                      {others.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Staat ook bij {others.map((s) => NEWS_SECTIONS[s].label).join(", ")}; dat kan alleen een beheerder van dat onderdeel
                          wijzigen.
                        </p>
                      )}
                    </div>
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
                      <Button size="sm" onClick={() => saveEdit(post)}>
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
                          {canEdit(post) && (
                            <>
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
                            </>
                          )}
                          {canRemove(post) && (
                            <button className="text-xs text-destructive hover:underline" onClick={() => remove(post)}>
                              verwijderen
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{post.body}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {postSections(post).map((s) => (
                          <span key={s} className="rounded-full border border-hhc-orange px-2 py-0.5 text-hhc-orange-dark">
                            {NEWS_SECTIONS[s].label}
                          </span>
                        ))}
                        <span>
                          {format(new Date(post.createdAt), "dd/MM/yyyy")}
                          {post.author?.name ? ` · ${post.author.name}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {loaded && visiblePosts.length === 0 && <p className="text-sm text-muted-foreground">Nog geen nieuwsberichten.</p>}
      </div>
    </div>
  );
}
