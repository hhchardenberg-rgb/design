"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MarkdownContent } from "@/components/markdown-content";
import { cn } from "@/lib/utils";

export interface KnowledgeArticleData {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
}

export function KnowledgeBrowser({
  articles,
  showSearch = true,
}: {
  articles: KnowledgeArticleData[];
  showSearch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!showSearch) return articles;
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) => a.title.toLowerCase().includes(q) || (a.body ?? "").toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q)
    );
  }, [articles, query, showSearch]);

  return (
    <div className="flex flex-col gap-4">
      {showSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek een handleiding, bv. 'Instagram Story'"
            className="pl-9"
          />
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen handleidingen gevonden voor &quot;{query}&quot;.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((a) => {
          const open = openId === a.id;
          return (
            <Card key={a.id} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
                onClick={() => setOpenId(open ? null : a.id)}
                aria-expanded={open}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {a.category && <Badge variant="outline">{a.category}</Badge>}
                  <p className="font-medium">{a.title}</p>
                </div>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  {a.body ? (
                    <MarkdownContent>{a.body}</MarkdownContent>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">Deze handleiding is nog niet geschreven.</p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
