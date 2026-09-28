import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { KnowledgeBrowser } from "@/components/knowledge-browser";

export const metadata: Metadata = { title: "Handleidingen · Ticketing" };

export default async function TicketingHandleidingenPage() {
  const articles = await prisma.ticketingArticle.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Handleidingen</h1>
        <p className="mt-1 text-muted-foreground">Stap-voor-stap-instructies voor het ticketingsysteem.</p>
      </div>
      <KnowledgeBrowser articles={articles} />
    </div>
  );
}
