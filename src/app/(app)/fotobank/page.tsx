import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";

export default async function FotobankPage() {
  const photos = await prisma.stockPhoto.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }] });
  const categories = Array.from(new Set(photos.map((p) => p.category)));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Fotobank</h1>
        <p className="mt-1 text-muted-foreground">Standaardfoto&apos;s om te gebruiken in je content. Klik op downloaden om de foto op te slaan.</p>
      </div>

      {categories.length === 0 && <p className="text-sm text-muted-foreground">Nog geen foto&apos;s beschikbaar.</p>}

      {categories.map((category) => (
        <section key={category}>
          <h2 className="mb-3 text-lg font-semibold capitalize">{category}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {photos
              .filter((p) => p.category === category)
              .map((p) => (
                <Card key={p.id} className="group relative overflow-hidden">
                  <div className="aspect-square bg-surface-muted bg-cover bg-center" style={{ backgroundImage: `url(${p.url})` }} />
                  <div className="flex items-center justify-between gap-2 p-3">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <a
                      href={p.url}
                      download
                      className="flex shrink-0 items-center gap-1 text-xs font-medium text-hhc-orange-dark hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Downloaden
                    </a>
                  </div>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
