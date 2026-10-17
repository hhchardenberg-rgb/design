import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TemplateLibrary } from "@/components/template-library";

export const metadata: Metadata = { title: "Nieuwe afbeelding" };

export default async function TemplateGalleryPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [templates, favorites, recentDesigns] = await Promise.all([
    prisma.template.findMany({
      where: { status: "PUBLISHED", activeVersionId: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, description: true, category: true, thumbnailUrl: true },
    }),
    prisma.templateFavorite.findMany({ where: { userId }, select: { templateId: true } }),
    prisma.generatedDesign.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { templateVersion: { select: { templateId: true } } },
    }),
  ]);

  // Recent gebruikt: per template de laatste keer, nieuwste eerst.
  const recent: string[] = [];
  for (const d of recentDesigns) {
    const id = d.templateVersion.templateId;
    if (!recent.includes(id)) recent.push(id);
    if (recent.length === 6) break;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Wat wil je maken?</h1>
        <p className="mt-1 text-muted-foreground">
          Kies een template. Je vult daarna alleen de gegevens in — de vormgeving staat al vast.
        </p>
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Er zijn nog geen templates gepubliceerd. Vraag een beheerder om een PSD-template te importeren.
        </p>
      ) : (
        <TemplateLibrary templates={templates} favoriteIds={favorites.map((f) => f.templateId)} recentIds={recent} />
      )}
    </div>
  );
}
