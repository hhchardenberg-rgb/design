import { prisma } from "@/lib/prisma";
import { ticketAudit } from "./audit.server";
import type { TicketsActor } from "./authz.server";
import { settingsSchema } from "./schemas";

export async function getTicketSettings() {
  return (await prisma.ticketSettings.findUnique({ where: { id: "default" } })) ?? (await prisma.ticketSettings.create({ data: { id: "default" } }));
}

export async function saveTicketSettings(actor: TicketsActor, raw: unknown) {
  const input = settingsSchema.parse(raw);
  const before = await getTicketSettings();
  const row = await prisma.ticketSettings.update({ where: { id: "default" }, data: { ...input, updatedBy: actor.name } });
  await ticketAudit({
    action: "settings.updated",
    actor: { id: actor.id, name: actor.name },
    meta: { before: { ...before, updatedAt: undefined }, after: input },
  });
  return row;
}
