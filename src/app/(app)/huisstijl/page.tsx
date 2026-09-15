import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function HuisstijlPage() {
  const [colors, fonts] = await Promise.all([
    prisma.brandColor.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
    prisma.font.findMany({ where: { isActive: true }, orderBy: [{ family: "asc" }, { weight: "asc" }] }),
  ]);

  const groups = Array.from(new Set(colors.map((c) => c.group)));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Huisstijl</h1>
        <p className="mt-1 text-muted-foreground">
          De officiële HHC Hardenberg-kleuren en lettertypen uit het huisstijlhandboek, zodat je ze ook buiten de
          designtool consistent kunt gebruiken.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Kleuren</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen huisstijlkleuren ingesteld.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group}>
                <p className="mb-2 text-sm font-medium capitalize text-muted-foreground">{group}</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {colors
                    .filter((c) => c.group === group)
                    .map((c) => (
                      <Card key={c.id} className="overflow-hidden">
                        <div className="h-16 w-full" style={{ backgroundColor: c.hex }} />
                        <CardContent className="p-3">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="font-mono text-xs uppercase text-muted-foreground">{c.hex}</p>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Lettertypen</h2>
        {fonts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen lettertypen geüpload.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fonts.map((f) => (
              <Card key={f.id}>
                <CardHeader>
                  <p className="text-2xl leading-tight" style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: f.style }}>
                    Aa Bb Cc
                  </p>
                  <CardTitle className="text-sm">{f.name}</CardTitle>
                  <CardDescription>
                    {f.family} · {f.weight} · {f.style}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
