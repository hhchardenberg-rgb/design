import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDesign } from "@/lib/design/permissions";
import { formatName } from "@/lib/design/families";
import { batchResponse } from "@/lib/design/batch.server";
import { BatchCreator } from "@/components/batch/batch-creator";

export const metadata: Metadata = { title: "Meerdere afbeeldingen maken" };

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

export default async function BatchPage() {
  const session = await auth();
  const user = session!.user;
  if (!canDesign(user.roles, "design:create")) notFound();

  const since = daysAgo(14);
  const [templates, matches, players, batches] = await Promise.all([
    prisma.template.findMany({
      where: { status: "PUBLISHED", activeVersionId: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { activeVersion: { select: { width: true, height: true, exportFormats: true } } },
    }),
    prisma.match.findMany({
      where: { date: { gte: since }, status: { not: "CANCELLED" } },
      orderBy: { date: "asc" },
      take: 80,
      include: { team: { select: { name: true } }, opponent: { select: { name: true } } },
    }),
    prisma.player.findMany({
      where: { active: true },
      orderBy: [{ team: { name: "asc" } }, { lastName: "asc" }],
      include: { team: { select: { name: true } } },
      take: 500,
    }),
    prisma.designBatch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/designs" className="text-xs text-muted-foreground hover:underline">
          &larr; Mijn ontwerpen
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Meerdere afbeeldingen tegelijk</h1>
        <p className="mt-1 text-muted-foreground">
          Kies een template en een reeks wedstrijden of spelers. Je krijgt alles in één ZIP, en elk ontwerp staat daarna ook bij Mijn ontwerpen.
        </p>
      </div>
      <BatchCreator
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          familyKey: t.familyKey,
          formatLabel: formatName(t.formatLabel, t.activeVersion!.width, t.activeVersion!.height),
          exportFormats: t.activeVersion!.exportFormats,
        }))}
        matches={matches.map((m) => ({
          id: m.id,
          date: m.date.toISOString(),
          label: `${m.team.name} - ${m.opponent.name}`,
          isHome: m.isHome,
        }))}
        players={players.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), team: p.team.name, hasPhoto: !!p.photoUrl }))}
        initialBatches={batches.map(batchResponse).map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }))}
      />
    </div>
  );
}
