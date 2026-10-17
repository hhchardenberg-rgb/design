"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LibraryTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  thumbnailUrl: string | null;
}

/**
 * Templatebibliotheek: zoeken, filteren op categorie, favorieten (ster) en
 * recent gebruikte templates bovenaan.
 */
export function TemplateLibrary({
  templates,
  favoriteIds,
  recentIds,
}: {
  templates: LibraryTemplate[];
  favoriteIds: string[];
  recentIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState(() => new Set(favoriteIds));

  const categories = useMemo(() => [...new Set(templates.map((t) => t.category))], [templates]);
  const q = query.trim().toLowerCase();
  const matches = (t: LibraryTemplate) =>
    (!category || t.category === category) &&
    (!q || [t.name, t.description ?? "", t.category].some((s) => s.toLowerCase().includes(q)));
  const visible = templates.filter(matches);
  const byId = new Map(templates.map((t) => [t.id, t]));
  const favoriteList = templates.filter((t) => favorites.has(t.id) && matches(t));
  const recentList = recentIds.map((id) => byId.get(id)).filter((t): t is LibraryTemplate => Boolean(t) && matches(t!));
  const filtering = Boolean(q || category);

  async function toggleFavorite(t: LibraryTemplate) {
    const next = !favorites.has(t.id);
    setFavorites((prev) => {
      const s = new Set(prev);
      if (next) s.add(t.id);
      else s.delete(t.id);
      return s;
    });
    const res = await fetch(`/api/templates/${t.slug}/favorite`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    }).catch(() => null);
    if (!res?.ok) {
      // Terugdraaien als het niet is opgeslagen.
      setFavorites((prev) => {
        const s = new Set(prev);
        if (next) s.delete(t.id);
        else s.add(t.id);
        return s;
      });
    }
  }

  const grid = (items: LibraryTemplate[]) => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((t) => (
        <div key={t.id} className="relative">
          <button
            type="button"
            onClick={() => toggleFavorite(t)}
            aria-label={favorites.has(t.id) ? `${t.name} uit favorieten` : `${t.name} als favoriet`}
            aria-pressed={favorites.has(t.id)}
            className="absolute right-2 top-2 z-10 rounded-full bg-background/90 p-1.5 shadow hover:bg-background"
          >
            <Star className={cn("h-4 w-4", favorites.has(t.id) ? "fill-hhc-orange text-hhc-orange" : "text-muted-foreground")} />
          </button>
          <Link href={`/templates/${t.slug}/create`}>
            <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div
                className="aspect-[4/5] bg-surface-muted bg-cover bg-center"
                style={t.thumbnailUrl ? { backgroundImage: `url(${t.thumbnailUrl})` } : undefined}
              />
              <CardContent className="p-4">
                <p className="font-semibold">{t.name}</p>
                {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
              </CardContent>
            </Card>
          </Link>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek een template..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Zoek een template" />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={category === null ? "primary" : "outline"} onClick={() => setCategory(null)}>
              Alles
            </Button>
            {categories.map((c) => (
              <Button key={c} size="sm" variant={category === c ? "primary" : "outline"} onClick={() => setCategory(c)}>
                {c}
              </Button>
            ))}
          </div>
        )}
      </div>

      {favoriteList.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Favorieten</h2>
          {grid(favoriteList)}
        </section>
      )}
      {!filtering && recentList.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent gebruikt</h2>
          {grid(recentList)}
        </section>
      )}

      {filtering ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            {visible.length === 0 ? "Geen templates gevonden" : `${visible.length} template${visible.length === 1 ? "" : "s"}`}
          </h2>
          {grid(visible)}
        </section>
      ) : (
        categories.map((c) => (
          <section key={c}>
            <h2 className="mb-3 text-lg font-semibold">{c}</h2>
            {grid(templates.filter((t) => t.category === c))}
          </section>
        ))
      )}
    </div>
  );
}
