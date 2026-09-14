"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export interface SearchItem {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl?: string | null;
  meta?: Record<string, unknown>;
}

export function EntitySearch({
  placeholder,
  fetchUrl,
  onSelect,
}: {
  placeholder: string;
  fetchUrl: (q: string) => string;
  onSelect: (item: SearchItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(fetchUrl(query), { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.items ?? []);
        setOpen(true);
      } catch {
        // stil negeren, gebruiker kan gewoon verder typen
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, fetchUrl]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => {
                onSelect(item);
                setQuery(item.label);
                setOpen(false);
              }}
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="h-6 w-6 rounded object-contain" />
              ) : (
                <span className="h-6 w-6 rounded bg-surface-muted" />
              )}
              <span>
                {item.label}
                {item.sublabel && <span className="ml-1 text-xs text-muted-foreground">{item.sublabel}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
