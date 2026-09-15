import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DesignDeleteButton } from "@/components/design-delete-button";

export default async function DesignsPage() {
  const session = await auth();
  const designs = await prisma.generatedDesign.findMany({
    where: { userId: session!.user.id },
    orderBy: { updatedAt: "desc" },
    include: { templateVersion: { include: { template: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Mijn ontwerpen</h1>
        <p className="mt-1 text-muted-foreground">Concepten en eerder gedownloade afbeeldingen.</p>
      </div>

      {designs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Je hebt nog geen ontwerpen gemaakt.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {designs.map((d) => (
            <div key={d.id} className="relative">
              <DesignDeleteButton designId={d.id} />
              <Link href={`/templates/${d.templateVersion.template.slug}/create?designId=${d.id}`}>
                <Card className="overflow-hidden transition-shadow hover:shadow-md">
                  <div
                    className="aspect-[4/5] bg-surface-muted bg-cover bg-center"
                    style={d.exportUrl ? { backgroundImage: `url(${d.exportUrl})` } : undefined}
                  />
                  <CardContent className="p-3">
                    <p className="truncate text-sm font-medium">{d.title ?? d.templateVersion.template.name}</p>
                    <Badge variant={d.status === "COMPLETED" ? "success" : "outline"} className="mt-1">
                      {d.status === "COMPLETED" ? "Voltooid" : "Concept"}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
