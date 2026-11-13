import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "@/lib/commercial/ctx.server";
import { visibleCompany } from "@/lib/commercial/companies.server";
import { parseLinkToken } from "./token";
import { isCommercialEnabled } from "@/lib/commercial/flag";

// Sponsorbanner in de ticketmail. Beheer en cijfers staan in Commerciële Zaken (tab Ticketmail bij het dossier);
// de mail kiest hier de banner en telt klikken via een eigen doorverwijzing.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik een geldige datum.").nullable().optional();
export const bannerSchema = z.object({
  name: z.string().trim().min(2, "Geef de banner een naam.").max(80),
  title: z.string().trim().min(2, "Vul een kop in.").max(80),
  text: z.string().trim().max(240).nullable().optional(),
  buttonLabel: z.string().trim().min(2).max(40).default("Bekijk het aanbod"),
  targetUrl: z.string().trim().url("Vul een geldige link in.").max(500).refine((u) => /^https?:\/\//i.test(u), "De link moet met http:// of https:// beginnen."),
  active: z.boolean().default(true),
  startsOn: day,
  endsOn: day,
});

const toDate = (v?: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Is de banner nu zichtbaar? Puur, dus testbaar. Einddatum geldt tot en met die dag. */
export function bannerLive(b: { active: boolean; startsOn: Date | null; endsOn: Date | null }, now: Date): boolean {
  if (!b.active) return false;
  if (b.startsOn && now < b.startsOn) return false;
  if (b.endsOn && now >= new Date(b.endsOn.getTime() + 86_400_000)) return false;
  return true;
}

/** Kiest de banner voor een mail: van de lopende banners die met de minste weergaven, zodat sponsors om de beurt aan bod komen. */
export async function pickBanner(now = new Date()) {
  // Banners worden in Commerciële Zaken beheerd; staat dat uit, dan gaat de ticketmail zonder banner.
  if (!isCommercialEnabled()) return null;
  const all = await prisma.ticketBanner.findMany({ include: { _count: { select: { sends: true } } } });
  const live = all.filter((b) => bannerLive(b, now));
  live.sort((a, b) => a._count.sends - b._count.sends || a.createdAt.getTime() - b.createdAt.getTime());
  return live[0] ?? null;
}

export const recordBannerSend = (bannerId: string, ticketId: string) => prisma.ticketBannerSend.create({ data: { bannerId, ticketId } });

/** Een klik: telt mee en geeft de doellink terug. Verwijst nooit naar iets anders dan de opgeslagen link. */
export async function registerBannerClick(bannerId: string, linkToken: string | null): Promise<string | null> {
  const banner = await prisma.ticketBanner.findUnique({ where: { id: bannerId }, select: { targetUrl: true } });
  if (!banner) return null;
  const ref = linkToken ? parseLinkToken(linkToken) : null;
  const ticket = ref ? await prisma.ticket.findUnique({ where: { publicId: ref.publicId }, select: { id: true } }) : null;
  await prisma.ticketBannerClick.create({ data: { bannerId, ticketId: ticket?.id ?? null } });
  return banner.targetUrl;
}

// ── Beheer in Commerciële Zaken ──

export async function bannersForCompany(ctx: RecordCtx, companyId: string) {
  need(ctx, "companies:read");
  await visibleCompany(ctx, companyId);
  const rows = await prisma.ticketBanner.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  const now = new Date();
  const out = [];
  for (const b of rows) {
    const [sent, clicks, uniq] = await Promise.all([
      prisma.ticketBannerSend.count({ where: { bannerId: b.id } }),
      prisma.ticketBannerClick.count({ where: { bannerId: b.id } }),
      prisma.ticketBannerClick.findMany({ where: { bannerId: b.id, ticketId: { not: null } }, distinct: ["ticketId"], select: { ticketId: true } }),
    ]);
    out.push({ id: b.id, name: b.name, title: b.title, text: b.text, buttonLabel: b.buttonLabel, targetUrl: b.targetUrl, active: b.active, startsOn: iso(b.startsOn), endsOn: iso(b.endsOn), live: bannerLive(b, now), sent, clicks, uniqueClicks: uniq.length, ctr: sent ? Math.round((uniq.length / sent) * 1000) / 10 : null });
  }
  return { banners: out };
}

export async function saveBanner(ctx: RecordCtx, companyId: string, bannerId: string | null, raw: unknown) {
  need(ctx, "companies:update");
  await visibleCompany(ctx, companyId);
  const i = bannerSchema.parse(raw);
  const data = { name: i.name, title: i.title, text: i.text || null, buttonLabel: i.buttonLabel, targetUrl: i.targetUrl, active: i.active, startsOn: toDate(i.startsOn), endsOn: toDate(i.endsOn) };
  if (data.startsOn && data.endsOn && data.endsOn < data.startsOn) throw new ApiError(400, "De einddatum ligt voor de startdatum.");
  if (bannerId) {
    const cur = await prisma.ticketBanner.findUnique({ where: { id: bannerId }, select: { companyId: true } });
    if (!cur || cur.companyId !== companyId) throw new ApiError(404, "Banner niet gevonden.");
    await prisma.ticketBanner.update({ where: { id: bannerId }, data });
    await auditRecord(ctx, { action: "ticketbanner.update", entity: "company", entityId: companyId, after: { bannerId } });
    return { id: bannerId };
  }
  const row = await prisma.ticketBanner.create({ data: { ...data, companyId, createdBy: ctx.label } });
  await auditRecord(ctx, { action: "ticketbanner.create", entity: "company", entityId: companyId, after: { bannerId: row.id } });
  return { id: row.id };
}

export async function deleteBanner(ctx: RecordCtx, companyId: string, bannerId: string) {
  need(ctx, "companies:update");
  await visibleCompany(ctx, companyId);
  const cur = await prisma.ticketBanner.findUnique({ where: { id: bannerId }, select: { companyId: true } });
  if (!cur || cur.companyId !== companyId) throw new ApiError(404, "Banner niet gevonden.");
  await prisma.ticketBanner.delete({ where: { id: bannerId } });
  await auditRecord(ctx, { action: "ticketbanner.delete", entity: "company", entityId: companyId, after: { bannerId } });
  return { ok: true };
}
