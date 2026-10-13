"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Newspaper, Pin, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface NewsPostView {
  id: string;
  title: string;
  body: string;
  category: string | null;
  imageUrl: string | null;
  pinned: boolean;
  createdAt: Date;
  authorName: string | null;
}

function PostBadges({ post }: { post: NewsPostView }) {
  return (
    <>
      {post.pinned && (
        <Badge variant="primary" className="flex items-center gap-1">
          <Pin className="h-3 w-3" />
          Vastgezet
        </Badge>
      )}
      {post.category && <Badge variant="outline">{post.category}</Badge>}
    </>
  );
}

/**
 * Nieuwsberichten als klikbare kaarten; een klik opent het volledige bericht in
 * een pop-up. "feed" is de lijst op de nieuwspagina, "dashboard" de rij van
 * kaarten met grote afbeelding op de startpagina van de Hub.
 */
export function NewsPosts({ posts, variant }: { posts: NewsPostView[]; variant: "feed" | "dashboard" }) {
  const [selected, setSelected] = useState<NewsPostView | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  return (
    <>
      {variant === "dashboard" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <button key={post.id} type="button" onClick={() => setSelected(post)} className="group text-left">
              <Card className={cn("flex h-full flex-col overflow-hidden transition-all group-hover:-translate-y-0.5 group-hover:shadow-md", post.pinned && "border-hhc-orange")}>
                {post.imageUrl ? (
                  <div className="aspect-video bg-surface-muted bg-cover bg-center" style={{ backgroundImage: `url(${post.imageUrl})` }} />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-surface-muted text-muted-foreground">
                    <Newspaper className="h-8 w-8" />
                  </div>
                )}
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostBadges post={post} />
                    <span className="text-xs text-muted-foreground">{format(post.createdAt, "d MMM", { locale: nl })}</span>
                  </div>
                  <p className="font-semibold leading-snug">{post.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{post.body}</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <button key={post.id} type="button" onClick={() => setSelected(post)} className="group text-left">
              <Card className={cn("overflow-hidden transition-shadow group-hover:shadow-md", post.pinned && "border-hhc-orange")}>
                {post.imageUrl && (
                  <div className="aspect-[3/1] bg-surface-muted bg-cover bg-center" style={{ backgroundImage: `url(${post.imageUrl})` }} />
                )}
                <CardContent className="flex flex-col gap-2 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostBadges post={post} />
                    <p className="font-semibold">{post.title}</p>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{post.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(post.createdAt, "d MMMM yyyy", { locale: nl })}
                    {post.authorName ? ` · ${post.authorName}` : ""}
                    <span className="ml-2 font-medium text-hhc-orange-dark group-hover:underline">Lees meer</span>
                  </p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        // Klik op de achtergrond (buiten het paneel) sluit de pop-up.
        onClick={(e) => e.target === dialogRef.current && setSelected(null)}
        aria-labelledby="news-dialog-title"
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/50"
      >
        {selected && (
          <article>
            {selected.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- afbeelding van de ingestelde opslag (Blob/S3), volledig tonen zonder bijsnijden
              <img src={selected.imageUrl} alt="" className="max-h-[50vh] w-full bg-surface-muted object-contain" />
            )}
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <PostBadges post={selected} />
                  </div>
                  <h2 id="news-dialog-title" className="text-xl font-bold leading-tight">
                    {selected.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Sluiten"
                  className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(selected.createdAt, "d MMMM yyyy", { locale: nl })}
                {selected.authorName ? ` · ${selected.authorName}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-sm">{selected.body}</p>
            </div>
          </article>
        )}
      </dialog>
    </>
  );
}
