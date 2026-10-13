import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { visibleCompany } from "./companies.server";
import { DEFAULT_DIGEST_FREQUENCY, isDigestFrequency, type DigestFrequency } from "./digest-frequency";

const ID = "default";

/** De standaardfrequentie van de herinneringsmail voor wie zelf niets koos. */
export async function loadDefaultDigestFrequency(): Promise<DigestFrequency> {
  const row = await prisma.commercialReminderSettings.findUnique({ where: { id: ID } });
  return isDigestFrequency(row?.defaultFrequency) ? row.defaultFrequency : DEFAULT_DIGEST_FREQUENCY;
}

export async function getReminderSettings(ctx: RecordCtx) {
  need(ctx, "settings:read");
  return { defaultFrequency: await loadDefaultDigestFrequency() };
}

export async function setReminderSettings(ctx: RecordCtx, input: { defaultFrequency: string }) {
  need(ctx, "settings:manage_settings");
  if (!isDigestFrequency(input.defaultFrequency)) throw new ApiError(400, "Onbekende frequentie.");
  const before = await loadDefaultDigestFrequency();
  await prisma.commercialReminderSettings.upsert({
    where: { id: ID },
    create: { id: ID, defaultFrequency: input.defaultFrequency, updatedById: ctx.userId },
    update: { defaultFrequency: input.defaultFrequency, updatedById: ctx.userId },
  });
  await auditRecord(ctx, { action: "reminder_settings.update", entity: "reminder_settings", entityId: ID, before: { defaultFrequency: before }, after: { defaultFrequency: input.defaultFrequency } });
}

/** Sponsor voor jezelf op stil zetten (of weer aan): geen herinneringen meer over contactmomenten en opzegdata. */
export async function setCompanyMuted(ctx: RecordCtx, companyId: string, muted: boolean) {
  need(ctx, "companies:read");
  const company = await visibleCompany(ctx, companyId);
  if (muted) {
    await prisma.commercialReminderMute.upsert({ where: { userId_companyId: { userId: ctx.userId, companyId } }, create: { userId: ctx.userId, companyId }, update: {} });
  } else {
    await prisma.commercialReminderMute.deleteMany({ where: { userId: ctx.userId, companyId } });
  }
  await auditRecord(ctx, { action: muted ? "reminder_mute.add" : "reminder_mute.remove", entity: "company", entityId: company.id });
}

/** Sponsoren die deze persoon zelf op stil zette. */
export async function mutedCompanyIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.commercialReminderMute.findMany({ where: { userId }, select: { companyId: true } });
  return new Set(rows.map((r) => r.companyId));
}

/** Voor beheerders: wie welke sponsor op stil zette. */
export async function listReminderMutes(ctx: RecordCtx) {
  need(ctx, "settings:manage_settings");
  const mutes = await prisma.commercialReminderMute.findMany({ orderBy: { createdAt: "desc" } });
  const [users, companies] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(mutes.map((m) => m.userId))] } }, select: { id: true, name: true, email: true } }),
    prisma.commercialCompany.findMany({ where: { id: { in: [...new Set(mutes.map((m) => m.companyId))] } }, select: { id: true, name: true } }),
  ]);
  const userBy = new Map(users.map((u) => [u.id, u.name || u.email]));
  const companyBy = new Map(companies.map((c) => [c.id, c.name]));
  return {
    mutes: mutes.map((m) => ({ id: m.id, userName: userBy.get(m.userId) ?? "Onbekend", companyId: m.companyId, companyName: companyBy.get(m.companyId) ?? "Onbekend", since: m.createdAt.toISOString() })),
  };
}

/** Beheerder zet een stilgezette sponsor voor iemand weer aan. */
export async function removeReminderMute(ctx: RecordCtx, id: string) {
  need(ctx, "settings:manage_settings");
  const mute = await prisma.commercialReminderMute.findUnique({ where: { id } });
  if (!mute) throw new ApiError(404, "Niet gevonden.");
  await prisma.commercialReminderMute.delete({ where: { id } });
  await auditRecord(ctx, { action: "reminder_mute.remove", entity: "company", entityId: mute.companyId, before: { userId: mute.userId } });
}
