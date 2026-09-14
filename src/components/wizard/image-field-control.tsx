"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { ImageFieldValue } from "@/lib/render/imageFit";
import { EntitySearch } from "./opponent-player-search";
import { Button } from "@/components/ui/button";

export function ImageFieldControl({
  fieldKey,
  label,
  value,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: ImageFieldValue | undefined;
  onChange: (value: ImageFieldValue) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpponent = /opponent|tegenstander/i.test(fieldKey);
  const isPlayer = /player|speler/i.test(fieldKey) && !/logo/i.test(fieldKey);
  const isLogo = /logo/i.test(fieldKey);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", isLogo ? "LOGO" : "PHOTO");
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        if (!res.ok) throw new Error("upload mislukt");
        const data = await res.json();
        onChange({ assetUrl: data.asset.url, panX: 0, panY: 0, scale: 1 });
      } catch {
        alert("Uploaden is niet gelukt. Probeer een ander bestand.");
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
            if (item.imageUrl) {
              onChange({ assetUrl: item.imageUrl, panX: 0, panY: 0, scale: 1 });
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
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Bezig..." : value?.assetUrl ? "Andere foto kiezen" : "Bestand kiezen"}
        </Button>
        {value?.assetUrl && (
          <div className="flex flex-1 items-center gap-2">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.05}
              value={value.scale ?? 1}
              onChange={(e) => onChange({ ...value, scale: Number(e.target.value) })}
              className="flex-1 accent-[var(--hhc-orange)]"
            />
          </div>
        )}
      </div>
      {value?.assetUrl && (
        <p className="text-xs text-muted-foreground">Sleep de afbeelding in de preview om te verschuiven.</p>
      )}
    </div>
  );
}
