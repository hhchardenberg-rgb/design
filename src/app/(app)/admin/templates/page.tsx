import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TemplateRowActions } from "./template-row-actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Concept",
  PUBLISHED: "Gepubliceerd",
  ARCHIVED: "Gearchiveerd",
};

export default async function AdminTemplatesPage() {
  const templates = await prisma.template.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      activeVersion: { select: { versionNumber: true } },
      versions: { select: { id: true }, orderBy: { versionNumber: "desc" } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="mt-1 text-muted-foreground">Beheer PSD-templates, versies en publicatiestatus.</p>
        </div>
        <Link href="/admin/templates/new">
          <Button>Nieuwe template uploaden</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{t.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.category}</p>
              </div>
              <Badge variant={t.status === "PUBLISHED" ? "success" : t.status === "DRAFT" ? "outline" : "default"}>
                {STATUS_LABEL[t.status]}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {t.versions.length} versie{t.versions.length !== 1 ? "s" : ""}
                {t.activeVersion && ` · actief: v${t.activeVersion.versionNumber}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/templates/${t.id}/builder`}>
                  <Button size="sm" variant="outline">
                    Beheren
                  </Button>
                </Link>
                <TemplateRowActions templateId={t.id} archived={t.status === "ARCHIVED"} />
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground">Nog geen templates. Upload een PSD-bestand om te beginnen.</p>
        )}
      </div>
    </div>
  );
}
