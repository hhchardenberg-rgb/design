import type { Metadata } from "next";
import { Download, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Excel-sjablonen" };

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function TicketingExcelPage() {
  const templates = await prisma.ticketingExcelTemplate.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
  });
  const categories = Array.from(new Set(templates.map((t) => t.category ?? "Overig")));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Excel-sjablonen</h1>
        <p className="mt-1 text-muted-foreground">Standaard Excel-bestanden om te gebruiken bij het ticketingsysteem.</p>
      </div>

      {templates.length === 0 && (
        <EmptyState
          icon={FileSpreadsheet}
          title="Nog geen sjablonen beschikbaar"
          description="Een beheerder kan Excel-sjablonen uploaden via Beheer → Ticketing → Excel-sjablonen."
        />
      )}

      {categories.map((category) => (
        <section key={category}>
          <h2 className="mb-3 text-lg font-semibold">{category}</h2>
          <div className="flex flex-col gap-3">
            {templates
              .filter((t) => (t.category ?? "Overig") === category)
              .map((t) => (
                <Card key={t.id}>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-hhc-orange-dark">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{t.title}</p>
                        {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.fileName}
                          {t.fileSize ? ` · ${formatSize(t.fileSize)}` : ""}
                        </p>
                      </div>
                    </div>
                    <a
                      href={t.url}
                      download
                      className="flex shrink-0 items-center gap-1 text-sm font-medium text-hhc-orange-dark hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      Downloaden
                    </a>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
