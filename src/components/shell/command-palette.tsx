"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellSection } from "./types";

interface Entry {
  key: string;
  title: string;
  href: string;
  section: string;
  group?: string;
  external?: boolean;
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Snel springen naar elke pagina waar de gebruiker recht op heeft (Ctrl/⌘ K).
 * Zoekt op paginanaam, groep en onderdeel; alleen wat al in het menu staat, dus
 * nooit een pagina die de gebruiker niet mag zien.
 */
export function CommandPalette({ open, onClose, sections }: { open: boolean; onClose: () => void; sections: ShellSection[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const s of sections) {
      const add = (e: Entry) => {
        if (seen.has(e.href)) return;
        seen.add(e.href);
        out.push(e);
      };
      add({ key: `${s.key}-home`, title: s.homeLabel === "Overzicht" || s.homeLabel === "Startpagina" || s.homeLabel === "Dashboard" ? `${s.label}: ${s.homeLabel.toLowerCase()}` : s.homeLabel, href: s.href, section: s.label });
      for (const g of s.groups) for (const i of g.items) {
        if (i.status === "soon") continue;
        add({ key: `${s.key}-${i.href}`, title: i.title, href: i.href, section: s.label, group: g.label, external: i.external });
      }
    }
    out.push({ key: "profiel", title: "Profiel en beveiliging", href: "/account/profiel", section: "Account" });
    return out;
  }, [sections]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return entries;
    const words = q.split(/\s+/);
    return entries
      .map((e) => {
        const hay = normalize(`${e.title} ${e.group ?? ""} ${e.section}`);
        if (!words.every((w) => hay.includes(w))) return null;
        const t = normalize(e.title);
        const score = t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2;
        return { e, score };
      })
      .filter((x): x is { e: Entry; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.e);
  }, [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  function go(e: Entry | undefined) {
    if (!e) return;
    onClose();
    if (e.external) window.open(e.href, "_blank", "noopener,noreferrer");
    else router.push(e.href);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/45 p-3 pt-[12vh] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Zoek in de Hub" className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.35)] animate-panel-in">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(results[index]); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            placeholder="Waar wil je naartoe?"
            aria-label="Zoek een pagina"
            className="h-13 w-full bg-transparent py-4 text-[0.9375rem] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[min(60vh,26rem)] overflow-y-auto p-1.5" role="listbox" aria-label="Resultaten">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">Geen pagina gevonden voor “{query}”.</li>}
          {results.map((e, i) => (
            <li key={e.key} role="option" aria-selected={i === index} data-index={i}>
              <button
                type="button"
                onMouseMove={() => setIndex(i)}
                onClick={() => go(e)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm", i === index ? "bg-surface-muted" : "")}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:block">{e.group ? `${e.section} · ${e.group}` : e.section}</span>
                {i === index ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-transparent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-border bg-surface-muted/60 px-4 py-2 text-[11px] text-muted-foreground">
          <span><kbd className="font-sans font-semibold">↑ ↓</kbd> kiezen</span>
          <span><kbd className="font-sans font-semibold">Enter</kbd> openen</span>
          <span className="ml-auto">Alleen pagina’s waar je toegang toe hebt</span>
        </div>
      </div>
    </div>
  );
}
