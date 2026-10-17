import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { canDesign } from "@/lib/design/permissions";

const PAGE = 48;

/**
 * Mediabibliotheek voor afbeeldingsvelden: eigen eerdere uploads, de
 * fotobank, club- en teamlogo's, tegenstanders en spelers. Elk item draagt
 * een assetverwijzing; bij opslaan controleert de server opnieuw of de
 * gebruiker hem mag gebruiken (eigen uploads alleen voor de eigenaar).
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!canDesign(user.roles, "design:create")) throw new ApiError(403, "Je hebt geen toegang tot de designtool.");
    const params = new URL(req.url).searchParams;
    const source = params.get("source") ?? "uploads";
    const q = params.get("q")?.trim().slice(0, 80) ?? "";
    const contains = (field: string) => (q ? { [field]: { contains: q, mode: "insensitive" as const } } : {});

    let items: { id: string; url: string; title: string; asset: { kind: string; id: string } }[] = [];
    if (source === "uploads") {
      const rows = await prisma.uploadedAsset.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: PAGE });
      items = rows.map((r) => ({
        id: r.id,
        url: r.url,
        title: new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(r.createdAt),
        asset: { kind: "upload", id: r.id },
      }));
    } else if (source === "stock") {
      const rows = await prisma.stockPhoto.findMany({
        where: q ? { OR: [contains("title"), contains("category")] } : {},
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        take: PAGE,
      });
      items = rows.map((r) => ({ id: r.id, url: r.url, title: r.title, asset: { kind: "stock", id: r.id } }));
    } else if (source === "logos") {
      const [clubs, teams, opponents] = await Promise.all([
        prisma.club.findMany({ where: { logoUrl: { not: null }, ...contains("name") }, orderBy: { name: "asc" }, take: PAGE }),
        prisma.team.findMany({ where: { logoUrl: { not: null }, ...contains("name") }, orderBy: { name: "asc" }, take: PAGE }),
        prisma.opponent.findMany({ where: { logoUrl: { not: null }, ...contains("name") }, orderBy: { name: "asc" }, take: PAGE }),
      ]);
      items = [
        ...clubs.map((c) => ({ id: c.id, url: c.logoUrl!, title: c.name, asset: { kind: "club", id: c.id } })),
        ...teams.map((t) => ({ id: t.id, url: t.logoUrl!, title: t.name, asset: { kind: "team", id: t.id } })),
        ...opponents.map((o) => ({ id: o.id, url: o.logoUrl!, title: o.name, asset: { kind: "opponent", id: o.id } })),
      ].slice(0, PAGE * 2);
    } else if (source === "players") {
      const rows = await prisma.player.findMany({
        where: { active: true, photoUrl: { not: null }, ...(q ? { OR: [contains("firstName"), contains("lastName")] } : {}) },
        orderBy: [{ lastName: "asc" }],
        take: PAGE,
      });
      items = rows.map((p) => ({ id: p.id, url: p.photoUrl!, title: `${p.firstName} ${p.lastName}`, asset: { kind: "player", id: p.id } }));
    } else {
      throw new ApiError(400, "Onbekende bron.");
    }
    return NextResponse.json({ items });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
