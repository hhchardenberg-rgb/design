import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { matchPrefill } from "@/lib/design/match-prefill";

/**
 * De actuele wedstrijdgegevens voor de velden van een templateversie, zodat
 * een ontwerp na een wijziging (tijd, score, locatie) bijgewerkt kan worden.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const versionId = new URL(request.url).searchParams.get("versionId");
    if (!versionId) return NextResponse.json({ error: "versionId ontbreekt." }, { status: 400 });

    const [match, fields] = await Promise.all([
      prisma.match.findUnique({ where: { id }, include: { team: true, opponent: true } }),
      prisma.templateField.findMany({ where: { templateVersionId: versionId }, select: { key: true, type: true } }),
    ]);
    if (!match) return NextResponse.json({ error: "Wedstrijd niet gevonden." }, { status: 404 });
    return NextResponse.json({ values: matchPrefill(fields, match) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
