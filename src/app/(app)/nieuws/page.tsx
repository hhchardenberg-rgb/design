import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/empty-state";
import { NewsPosts } from "@/components/news-posts";

export const metadata: Metadata = { title: "Nieuws" };

export default async function NieuwsPage() {
  const posts = await prisma.newsPost.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { name: true } } },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Nieuws</h1>
        <p className="mt-1 text-muted-foreground">Het laatste nieuws voor Team Communicatie.</p>
      </div>

      {posts.length === 0 && (
        <EmptyState
          icon={Newspaper}
          title="Nog geen nieuwsberichten"
          description="Zodra Team Communicatie iets plaatst, verschijnt het hier."
        />
      )}

      <NewsPosts
        variant="feed"
        posts={posts.map(({ author, ...post }) => ({ ...post, authorName: author?.name ?? null }))}
      />
    </div>
  );
}
