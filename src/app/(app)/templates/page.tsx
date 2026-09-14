import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";

export default async function TemplateGalleryPage() {
  const templates = await prisma.template.findMany({
    where: { status: "PUBLISHED", activeVersionId: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const byCategory = new Map<string, typeof templates>();
  for (const t of templates) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold">Wat wil je maken?</h1>
        <p className="mt-1 text-muted-foreground">
          Kies een template. Je vult daarna alleen de gegevens in — de vormgeving staat al vast.
        </p>
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Er zijn nog geen templates gepubliceerd. Vraag een beheerder om een PSD-template te importeren.
        </p>
      )}

      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-lg font-semibold">{category}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((t) => (
              <Link key={t.id} href={`/templates/${t.slug}/create`}>
                <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div
                    className="aspect-[4/5] bg-surface-muted bg-cover bg-center"
                    style={t.thumbnailUrl ? { backgroundImage: `url(${t.thumbnailUrl})` } : undefined}
                  />
                  <CardContent className="p-4">
                    <p className="font-semibold">{t.name}</p>
                    {t.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
