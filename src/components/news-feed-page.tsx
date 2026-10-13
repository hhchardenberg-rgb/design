import Link from "next/link";
import { Newspaper } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { NewsPosts, type NewsPostView } from "@/components/news-posts";
import { NEWS_SECTIONS, type NewsSection } from "@/lib/news";

/** De nieuwspagina van één onderdeel; met een link naar het beheer voor wie mag schrijven. */
export function NewsFeedPage({
  section,
  posts,
  enabled,
  manageHref,
}: {
  section: NewsSection;
  posts: NewsPostView[];
  enabled: boolean;
  manageHref?: string | null;
}) {
  const info = NEWS_SECTIONS[section];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Nieuws</h1>
          <p className="mt-1 text-muted-foreground">Het laatste nieuws voor {info.audience}.</p>
        </div>
        {manageHref && (
          <Link href={manageHref} className="text-sm font-medium text-hhc-orange-dark hover:underline">
            Nieuws beheren
          </Link>
        )}
      </div>

      {!enabled && (
        <p className="rounded-md border border-hhc-orange bg-primary/10 p-3 text-sm">
          Het nieuws voor {info.label} staat uit. Alleen beheerders zien deze pagina; zet het aan via Nieuws beheren.
        </p>
      )}

      {posts.length === 0 && (
        <EmptyState
          icon={Newspaper}
          title="Nog geen nieuwsberichten"
          description={`Zodra er nieuws is voor ${info.label}, verschijnt het hier.`}
        />
      )}

      <NewsPosts variant="feed" posts={posts} />
    </div>
  );
}
