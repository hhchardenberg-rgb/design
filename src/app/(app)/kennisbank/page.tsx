import { prisma } from "@/lib/prisma";
import { KnowledgeBrowser } from "@/components/knowledge-browser";

export default async function KennisbankPage() {
  const articles = await prisma.knowledgeArticle.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }] });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Kennisbank</h1>
        <p className="mt-1 text-muted-foreground">
          De HHC Communicatie-wiki: handleidingen en werkwijzen voor Team Communicatie.
        </p>
      </div>
      <KnowledgeBrowser articles={articles} />
    </div>
  );
}
