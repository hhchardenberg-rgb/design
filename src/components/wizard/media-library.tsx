"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImageAssetRef } from "@/lib/design/form-data";
import { cn } from "@/lib/utils";

export interface MediaItem {
  id: string;
  url: string;
  title: string;
  asset: ImageAssetRef;
}

const SOURCES = [
  { key: "uploads", label: "Mijn uploads" },
  { key: "stock", label: "Fotobank" },
  { key: "players", label: "Spelers" },
  { key: "logos", label: "Logo's" },
] as const;

type Source = (typeof SOURCES)[number]["key"];

/**
 * Kiezen uit eerder gebruikte en gedeelde afbeeldingen, zodat dezelfde foto
 * niet opnieuw geüpload hoeft te worden.
 */
export function MediaLibrary({
  open,
  initialSource = "uploads",
  onClose,
  onPick,
}: {
  open: boolean;
  initialSource?: Source;
  onClose: () => void;
  onPick: (item: MediaItem) => void;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setItems(null);
      setError(null);
      try {
        const res = await fetch(`/api/media?source=${source}&q=${encodeURIComponent(query)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Laden is niet gelukt.");
        if (!cancelled) setItems(data.items);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Laden is niet gelukt.");
      }
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, source, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Mediabibliotheek" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-t-xl bg-background p-4 shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mediabibliotheek</h2>
          <Button size="icon" variant="ghost" aria-label="Sluiten" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {SOURCES.map((s) => (
            <Button key={s.key} size="sm" variant={source === s.key ? "primary" : "outline"} onClick={() => setSource(s.key)}>
              {s.label}
            </Button>
          ))}
        </div>
        {source !== "uploads" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Zoeken..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}
        <div className="min-h-[200px] overflow-y-auto">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!items && !error && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {items && items.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {source === "uploads" ? "Je hebt nog niets geüpload." : "Niets gevonden."}
            </p>
          )}
          {items && items.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {items.map((item) => (
                <button
                  key={`${item.asset.kind}:${item.id}`}
                  type="button"
                  onClick={() => onPick(item)}
                  className={cn("group flex flex-col gap-1 rounded-md border border-border p-1 text-left hover:border-hhc-orange")}
                  title={item.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.title}
                    loading="lazy"
                    className={cn("aspect-square w-full rounded bg-surface-muted", source === "logos" ? "object-contain p-2" : "object-cover")}
                  />
                  <span className="truncate text-xs text-muted-foreground">{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
