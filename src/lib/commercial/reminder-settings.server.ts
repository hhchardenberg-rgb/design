import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
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
