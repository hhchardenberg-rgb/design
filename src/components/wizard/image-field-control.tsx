"use client";

import { useCallback, useRef, useState } from "react";
import { Images, Upload } from "lucide-react";
import type { ImageFieldValue } from "@/lib/render/imageFit";
import { EntitySearch } from "./opponent-player-search";
import { Button } from "@/components/ui/button";
import { shrinkImageForUpload } from "@/lib/client/shrink-image";
import { MediaLibrary } from "./media-library";

export function ImageFieldControl({
  fieldKey,
  label,
  value,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: ImageFieldValue | undefined;
  onChange: (value: ImageFieldValue, coalesceKey?: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpponent = /opponent|tegenstander/i.test(fieldKey);
  const isPlayer = /player|speler/i.test(fieldKey) && !/logo/i.test(fieldKey);
  const isLogo = /logo/i.test(fieldKey);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", await shrinkImageForUpload(file));
        form.append("kind", isLogo ? "LOGO" : "PHOTO");
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Uploaden is niet gelukt.");
        const data = await res.json();
        onChange({ asset: { kind: "upload", id: data.asset.id }, assetUrl: data.asset.url, panX: 0, panY: 0, scale: 1 });
      } catch (error) {
        alert(`${error instanceof Error ? error.message : "Uploaden is niet gelukt."} Probeer een ander bestand.`);
      } finally {
        setUploading(false);
      }
    },
    [isLogo, onChange]
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{label}</label>

      {(isOpponent || isPlayer) && (
        <EntitySearch
          placeholder={isPlayer ? "Zoek speler..." : "Zoek tegenstander..."}
          fetchUrl={(q) => (isPlayer ? `/api/players/search?q=${encodeURIComponent(q)}` : `/api/opponents/search?q=${encodeURIComponent(q)}`)}
          onSelect={(item) => {
            if (item.imageUrl && item.asset) {
              onChange({ asset: item.asset, assetUrl: item.imageUrl, panX: 0, panY: 0, scale: 1 });
            }
          }}
        />
      )}

      <div
        className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-border bg-surface-muted text-center text-sm text-muted-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        onPaste={(e) => {
          const file = Array.from(e.clipboardData.items)
            .find((i) => i.type.startsWith("image/"))
            ?.getAsFile();
          if (file) upload(file);
        }}
      >
        {value?.assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.assetUrl} alt={label} className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 px-4 py-6">
            <Upload className="h-5 w-5" />
            <span>Sleep een bestand hierheen, plak een afbeelding, of</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Bezig..." : value?.assetUrl ? "Ander bestand" : "Bestand kiezen"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setLibraryOpen(true)}>
          <Images className="h-4 w-4" /> Bibliotheek
        </Button>
        {value?.assetUrl && (
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.05}
              value={value.scale ?? 1}
              onChange={(e) => onChange({ ...value, scale: Number(e.target.value) }, `zoom:${fieldKey}`)}
              aria-label={`Zoom ${label}`}
              className="flex-1 accent-[var(--hhc-orange)]"
            />
          </div>
        )}
      </div>
      {value?.assetUrl && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Sleep de afbeelding in de preview om te verschuiven; knijp om te zoomen.</p>
          {(value.panX || value.panY || (value.scale ?? 1) !== 1) && (
            <button
              type="button"
              onClick={() => onChange({ ...value, panX: 0, panY: 0, scale: 1 })}
              className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Uitsnede herstellen
            </button>
          )}
        </div>
      )}
      <MediaLibrary
        open={libraryOpen}
        initialSource={isLogo ? "logos" : isPlayer ? "players" : "uploads"}
        onClose={() => setLibraryOpen(false)}
        onPick={(item) => {
          setLibraryOpen(false);
          onChange({ asset: item.asset, assetUrl: item.url, panX: 0, panY: 0, scale: 1 });
        }}
      />
    </div>
  );
}
