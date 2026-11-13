import { prisma } from "@/lib/prisma";
import { getTicketSettings } from "./settings.server";

// Bewaartermijnen (AVG): persoonsgegevens worden na de vervaldatum + termijn geanonimiseerd
// (totalen blijven), oude scans, verzendlogs en technische logs worden verwijderd.

const MONTH = 30 * 86_400_000;

export async function runTicketRetention(now = new Date()) {
  const s = await getTicketSettings();
  const personalBefore = new Date(now.getTime() - s.retentionPersonalMonths * MONTH);
  const old = await prisma.ticket.findMany({ where: { anonymizedAt: null, validUntil: { lt: personalBefore } }, select: { id: true, status: true }, take: 2000 });
  for (const t of old) {
    await prisma.ticket.update({
      where: { id: t.id },
      data: { firstName: "Geanonimiseerd", lastName: "", email: null, phone: null, company: null, relation: null, note: null, photoKey: null, anonymizedAt: now, status: t.status === "ACTIVE" ? "CANCELLED" : t.status, statusReason: "Bewaartermijn verstreken", linkVersion: { increment: 1 }, qrVersion: { increment: 1 } },
    });
  }
  const scanBefore = new Date(now.getTime() - s.retentionScanMonths * MONTH);
  const technicalBefore = new Date(now.getTime() - s.retentionTechnicalDays * 86_400_000);
  const [scans, deliveries, runs] = await Promise.all([
    prisma.ticketScan.deleteMany({ where: { scannedAt: { lt: scanBefore } } }),
    prisma.ticketDelivery.deleteMany({ where: { createdAt: { lt: scanBefore } } }),
    prisma.ticketSyncRun.deleteMany({ where: { startedAt: { lt: technicalBefore } } }),
  ]);
  return { anonymized: old.length, scansDeleted: scans.count, deliveriesDeleted: deliveries.count, syncRunsDeleted: runs.count };
}
