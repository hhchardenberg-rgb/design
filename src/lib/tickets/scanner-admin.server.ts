import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { hashPin, newLoginCode, newPin } from "./scanner-auth.server";

// Scannerbeheer: scanners (code + PIN) en ingangen. De PIN wordt maar één keer getoond.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });

const scannerSchema = z.object({
  name: z.string().trim().min(2, "Geef de scanner een naam.").max(60),
  supervisor: z.boolean().default(false),
  active: z.boolean().default(true),
  entranceId: z.string().max(40).nullish(),
});
const entranceSchema = z.object({ name: z.string().trim().min(2, "Geef de ingang een naam.").max(60), zoneId: z.string().max(40).nullish(), active: z.boolean().default(true) });

export async function listScanners(actor: TicketsActor) {
  need(actor, "scanners:manage");
  const [scanners, entrances, zones] = await Promise.all([
    prisma.ticketScanner.findMany({ orderBy: { name: "asc" }, include: { entrance: { select: { name: true } } } }),
    prisma.ticketEntrance.findMany({ orderBy: { name: "asc" } }),
    prisma.ticketZone.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    scanners: scanners.map((s) => ({ id: s.id, name: s.name, loginCode: s.loginCode, supervisor: s.supervisor, active: s.active, entranceId: s.entranceId, entrance: s.entrance?.name ?? null, lastSeenAt: s.lastSeenAt, locked: !!s.lockedUntil && s.lockedUntil > new Date() })),
    entrances,
    zones,
  };
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const c = newLoginCode();
    if (!(await prisma.ticketScanner.findUnique({ where: { loginCode: c }, select: { id: true } }))) return c;
  }
  throw new ApiError(500, "Er kon geen unieke code worden gemaakt. Probeer het opnieuw.");
}

export async function createScanner(actor: TicketsActor, raw: unknown) {
  need(actor, "scanners:manage");
  const input = scannerSchema.parse(raw);
  const pin = newPin();
  const s = await prisma.ticketScanner.create({ data: { name: input.name, supervisor: input.supervisor, active: input.active, entranceId: input.entranceId ?? null, loginCode: await uniqueCode(), pinHash: await hashPin(pin) } });
  await ticketAudit({ action: "scanner.saved", actor: actorOf(actor), scannerId: s.id, summary: `Scanner '${s.name}' aangemaakt${s.supervisor ? " (supervisor)" : ""}` });
  return { id: s.id, loginCode: s.loginCode, pin };
}

export async function updateScanner(actor: TicketsActor, id: string, raw: unknown) {
  need(actor, "scanners:manage");
  const input = scannerSchema.parse(raw);
  const cur = await prisma.ticketScanner.findUnique({ where: { id } });
  if (!cur) throw new ApiError(404, "Scanner niet gevonden.");
  // Uitschakelen of rechten wijzigen: lopende sessies direct ongeldig.
  const revoke = cur.active !== input.active || cur.supervisor !== input.supervisor;
  await prisma.ticketScanner.update({ where: { id }, data: { name: input.name, supervisor: input.supervisor, active: input.active, entranceId: input.entranceId ?? null, ...(revoke ? { tokenVersion: { increment: 1 } } : {}) } });
  await ticketAudit({ action: "scanner.saved", actor: actorOf(actor), scannerId: id, summary: `Scanner '${input.name}' gewijzigd`, meta: { active: input.active, supervisor: input.supervisor } });
  return { ok: true };
}

export async function resetScannerPin(actor: TicketsActor, id: string) {
  need(actor, "scanners:manage");
  const cur = await prisma.ticketScanner.findUnique({ where: { id } });
  if (!cur) throw new ApiError(404, "Scanner niet gevonden.");
  const pin = newPin();
  await prisma.ticketScanner.update({ where: { id }, data: { pinHash: await hashPin(pin), tokenVersion: { increment: 1 }, failedAttempts: 0, lockedUntil: null } });
  await ticketAudit({ action: "scanner.pin_reset", actor: actorOf(actor), scannerId: id, summary: `PIN van scanner '${cur.name}' opnieuw ingesteld` });
  return { loginCode: cur.loginCode, pin };
}

export async function saveEntrance(actor: TicketsActor, id: string | null, raw: unknown) {
  need(actor, "scanners:manage");
  const input = entranceSchema.parse(raw);
  const e = id
    ? await prisma.ticketEntrance.update({ where: { id }, data: { name: input.name, zoneId: input.zoneId ?? null, active: input.active } })
    : await prisma.ticketEntrance.create({ data: { name: input.name, zoneId: input.zoneId ?? null, active: input.active } });
  await ticketAudit({ action: "entrance.saved", actor: actorOf(actor), summary: `Ingang '${e.name}' ${id ? "gewijzigd" : "aangemaakt"}` });
  return { id: e.id };
}
