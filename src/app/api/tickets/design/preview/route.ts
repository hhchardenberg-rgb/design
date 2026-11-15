import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireTickets } from "@/lib/tickets/authz.server";
import { cleanOverrides, requireScope } from "@/lib/tickets/design/admin.server";
import { currentAssets, loadAssetBytes, resolveContext } from "@/lib/tickets/design/context.server";
import { layoutForView, renderPdf } from "@/lib/tickets/design/pdf.server";
import { scopeKeyOf } from "@/lib/tickets/design/resolve";
import { sampleFacts, type SampleEvent } from "@/lib/tickets/design/sample";
import { buildView, usedAssetIds, SAMPLE_PRESETS, type SamplePreset } from "@/lib/tickets/design/view";
import { viewIssues } from "@/lib/tickets/design/validate";
import type { TicketKind } from "@/lib/tickets/design/fields";
import { formatDayTime } from "@/lib/date-format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Voorbeeld in de editor: de A4-indeling (posities) of een echte voorbeeld-pdf met het concept van
 * het bewerkte niveau. Altijd voorbeeldgegevens met een testcode zonder toegang.
 */
export async function POST(req: Request) {
  try {
    await requireTickets("design:read");
    const body = (await req.json().catch(() => ({}))) as { scopeKey?: string; overrides?: unknown; kind?: string; typeId?: string | null; preset?: string; event?: SampleEvent | null; seasonId?: string | null; eventId?: string | null; seasonName?: string | null; typeName?: string | null; typeColor?: string | null; output?: string };
    const ref = requireScope(String(body.scopeKey ?? ""));
    const overrides = await cleanOverrides(body.overrides ?? {}, ref);
    const kind = (["match", "hospitality", "season"] as const).find((k) => k === body.kind) ?? "match";
    const preset = (Object.keys(SAMPLE_PRESETS) as SamplePreset[]).find((p) => p === body.preset) ?? "kort";
    const ctx = { kind: kind as TicketKind, typeId: body.typeId ?? null, seasonId: body.seasonId ?? null, eventId: kind === "season" ? null : body.eventId ?? null };
    const res = await resolveContext(ctx, { draft: { scopeKey: scopeKeyOf(ref), overrides } });
    const assets = await currentAssets([...new Set([...usedAssetIds(res.a4), ...usedAssetIds(res.mobile)])]);
    const facts = sampleFacts({ kind: ctx.kind, preset, event: body.event ?? null, typeName: body.typeName, typeColor: body.typeColor, seasonName: body.seasonName });
    const view = buildView(facts, res.a4, "a4", assets);
    const layout = await layoutForView(view, formatDayTime(new Date()));
    if (body.output === "pdf") {
      const bytes = await renderPdf([layout], loadAssetBytes, { title: "Voorbeeldticket HHC Hardenberg" });
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="hhc-voorbeeldticket.pdf"', "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ layout, issues: [...viewIssues(view), ...layout.issues] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
