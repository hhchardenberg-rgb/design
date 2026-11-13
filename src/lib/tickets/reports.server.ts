import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { pdfSafe } from "./delivery";
import { toCsv, toXlsx, type Cell } from "./export";
import { TICKET_CATEGORIES, TICKET_STATUS_LABELS, SCAN_REASON_LABELS, displayStatus, type ScanReason, type TicketCategory, type TicketStatus } from "./rules";
import { coveringTickets } from "./scan.server";

// Rapportages en exports per wedstrijd. Omzet staat er bewust niet in: HHC-tickets zijn gratis
// en Fullhouse-omzet wordt niet gesynchroniseerd (de Hub bewaart geen betaalgegevens).

const BUCKET_MS = 15 * 60_000;
const catLabel = (c: string) => TICKET_CATEGORIES[c as TicketCategory] ?? c;

export async function eventReport(actor: TicketsActor, eventId: string) {
  need(actor, "reports:read");
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const [covering, scans, extValid] = await Promise.all([
    coveringTickets(event),
    prisma.ticketScan.findMany({ where: { eventId }, select: { ticketId: true, codeHash: true, source: true, result: true, reentry: true, offline: true, overrideById: true, scannedAt: true, entranceId: true } }),
    event.externalId ? prisma.ticketExternalTicket.count({ where: { eventExtId: event.externalId, status: "VALID" } }) : 0,
  ]);
  const entrances = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  const admittedIds = new Set(scans.filter((s) => s.result === "VALID" && s.source === "HHC" && s.ticketId).map((s) => s.ticketId!));
  const admittedExternal = new Set(scans.filter((s) => s.result === "VALID" && s.source === "FULLHOUSE" && s.codeHash).map((s) => s.codeHash!));
  const byType = new Map<string, { category: string; issued: number; admitted: number }>();
  for (const t of covering) {
    const row = byType.get(t.type.name) ?? { category: t.category, issued: 0, admitted: 0 };
    row.issued++;
    if (admittedIds.has(t.id)) row.admitted++;
    byType.set(t.type.name, row);
  }
  const timeline = new Map<number, number>();
  const byEntrance = new Map<string, number>();
  for (const s of scans) {
    if (s.result !== "VALID") continue;
    const k = Math.floor(s.scannedAt.getTime() / BUCKET_MS) * BUCKET_MS;
    timeline.set(k, (timeline.get(k) ?? 0) + 1);
    const n = (s.entranceId && entrances.get(s.entranceId)) || "Zonder ingang";
    byEntrance.set(n, (byEntrance.get(n) ?? 0) + 1);
  }
  const count = (f: (s: (typeof scans)[number]) => boolean) => scans.filter(f).length;
  return {
    event: { id: event.id, title: event.title, startsAt: event.startsAt, status: event.status },
    hhc: { issued: covering.length, admitted: admittedIds.size, notYetScanned: covering.length - admittedIds.size },
    fullhouse: { valid: extValid, admitted: admittedExternal.size, linked: !!event.externalId },
    inside: admittedIds.size + admittedExternal.size,
    scans: { valid: count((s) => s.result === "VALID"), warnings: count((s) => s.result === "WARNING"), invalid: count((s) => s.result === "INVALID"), overrides: count((s) => !!s.overrideById), offline: count((s) => s.offline), reentries: count((s) => s.reentry) },
    byType: [...byType.entries()].map(([name, v]) => ({ name, category: v.category, categoryLabel: catLabel(v.category), issued: v.issued, admitted: v.admitted })).sort((a, b) => b.issued - a.issued),
    byEntrance: [...byEntrance.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    timeline: [...timeline.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ at: new Date(t).toISOString(), count })),
  };
}

export type ExportKind = "tickets" | "scans" | "rapport";
export type ExportFormat = "csv" | "xlsx" | "pdf";

async function ticketRows(actor: TicketsActor, eventId?: string): Promise<Cell[][]> {
  const personal = actor.access.can("tickets:personal");
  const now = new Date();
  let ids: string[] | null = null;
  if (eventId) {
    const event = await prisma.ticketEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
    ids = (await coveringTickets(event)).map((t) => t.id);
  }
  const tickets = await prisma.ticket.findMany({ where: ids ? { id: { in: ids } } : {}, orderBy: { createdAt: "desc" }, take: 20_000, include: { type: { select: { name: true } }, links: { select: { eventId: true } } } });
  const head: Cell[] = ["Ticket-ID", "Type", "Categorie", "Status", "Geldig vanaf", "Geldig t/m", "Aantal wedstrijden", "Uitgegeven op", "Uitgegeven door", "Bron"];
  if (personal) head.push("Voornaam", "Achternaam", "E-mail", "Bedrijf", "Relatie");
  return [
    head,
    ...tickets.map((t) => {
      const row: Cell[] = [t.publicId, t.type.name, catLabel(t.category), TICKET_STATUS_LABELS[displayStatus({ status: t.status as TicketStatus, validUntil: t.validUntil }, now)], t.validFrom ? formatDay(t.validFrom) : "", t.validUntil ? formatDay(t.validUntil) : "", t.links.length, formatDay(t.createdAt), t.issuedByName ?? "", t.originSystem ?? "HHC"];
      if (personal) row.push(t.anonymizedAt ? "" : t.firstName, t.anonymizedAt ? "" : t.lastName, t.email ?? "", t.company ?? "", t.relation ?? "");
      return row;
    }),
  ];
}

async function scanRows(eventId: string): Promise<Cell[][]> {
  const rows = await prisma.ticketScan.findMany({ where: { eventId }, orderBy: { scannedAt: "asc" }, take: 50_000, include: { scanner: { select: { name: true } } } });
  const entrances = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  return [
    ["Tijd", "Uitslag", "Reden", "Ticket (initialen en type)", "Bron", "Ingang", "Scanner", "Offline", "Override door", "Override reden", "Notitie"],
    ...rows.map((r) => [formatDayTime(r.scannedAt), r.result === "VALID" ? "Geldig" : r.result === "WARNING" ? "Waarschuwing" : "Afgewezen", r.reason ? SCAN_REASON_LABELS[r.reason as ScanReason] : "", r.holderLabel ?? "", r.source === "HHC" ? "HHC" : "Fullhouse", (r.entranceId && entrances.get(r.entranceId)) || "", r.scanner?.name ?? "", r.offline ? "ja" : "", r.overrideBy ?? "", r.overrideReason ?? "", r.note ?? ""] as Cell[]),
  ];
}

async function reportPdf(rep: Awaited<ReturnType<typeof eventReport>>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: rgb(0.949, 0.416, 0.129) });
  page.drawText("HHC Tickets - wedstrijdrapport", { x: 40, y: 806, size: 18, font: bold, color: rgb(1, 1, 1) });
  let y = 750;
  const line = (text: string, size = 11, f = font) => {
    page.drawText(pdfSafe(text), { x: 40, y, size, font: f, color: rgb(0.1, 0.1, 0.1), maxWidth: 515 });
    y -= size + 8;
  };
  line(rep.event.title, 16, bold);
  line(formatDayTime(rep.event.startsAt), 11);
  y -= 8;
  line("Toegang", 13, bold);
  line(`Binnen (personen): ${rep.inside}`);
  line(`HHC-tickets: ${rep.hhc.issued} uitgegeven, ${rep.hhc.admitted} binnen, ${rep.hhc.notYetScanned} niet gescand`);
  line(`Fullhouse-tickets: ${rep.fullhouse.linked ? `${rep.fullhouse.valid} geldig, ${rep.fullhouse.admitted} binnen` : "geen koppeling"}`);
  line(`Scans: ${rep.scans.valid} geldig, ${rep.scans.warnings} waarschuwingen, ${rep.scans.invalid} afgewezen, ${rep.scans.overrides} overrides, ${rep.scans.offline} offline`);
  y -= 8;
  line("Per tickettype (HHC)", 13, bold);
  for (const t of rep.byType.slice(0, 25)) line(`${t.name} (${t.categoryLabel}): ${t.issued} uitgegeven, ${t.admitted} binnen`);
  y -= 8;
  line("Per ingang", 13, bold);
  for (const e of rep.byEntrance.slice(0, 15)) line(`${e.name}: ${e.count}`);
  page.drawText(pdfSafe(`Gemaakt op ${formatDayTime(new Date())}. Zonder persoonsgegevens.`), { x: 40, y: 30, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  return pdf.save();
}

export async function buildExport(actor: TicketsActor, kind: ExportKind, format: ExportFormat, eventId?: string) {
  need(actor, "exports:export");
  let body: Uint8Array | string;
  let name: string;
  let type: string;
  if (kind === "rapport") {
    if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
    const rep = await eventReport(actor, eventId);
    if (format === "pdf") {
      body = await reportPdf(rep);
      type = "application/pdf";
      name = "wedstrijdrapport.pdf";
    } else {
      const rows: Cell[][] = [["Onderdeel", "Waarde"], ["Wedstrijd", rep.event.title], ["Binnen (personen)", rep.inside], ["HHC uitgegeven", rep.hhc.issued], ["HHC binnen", rep.hhc.admitted], ["Fullhouse geldig", rep.fullhouse.valid], ["Fullhouse binnen", rep.fullhouse.admitted], ["Scans geldig", rep.scans.valid], ["Waarschuwingen", rep.scans.warnings], ["Afgewezen", rep.scans.invalid], ["Overrides", rep.scans.overrides], ["Offline gescand", rep.scans.offline], ...rep.byType.map((t): Cell[] => [`Type: ${t.name}`, `${t.issued} uitgegeven, ${t.admitted} binnen`]), ...rep.byEntrance.map((e): Cell[] => [`Ingang: ${e.name}`, e.count])];
      body = format === "xlsx" ? await toXlsx(rows, "Rapport") : toCsv(rows);
      type = format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8";
      name = `wedstrijdrapport.${format}`;
    }
  } else {
    if (format === "pdf") throw new ApiError(400, "Deze export is er als CSV of Excel.");
    let rows: Cell[][];
    if (kind === "tickets") {
      need(actor, "tickets:read");
      rows = await ticketRows(actor, eventId);
    } else {
      need(actor, "scan:history");
      if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
      rows = await scanRows(eventId);
    }
    body = format === "xlsx" ? await toXlsx(rows, kind === "tickets" ? "Tickets" : "Scans") : toCsv(rows);
    type = format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8";
    name = `${kind}.${format}`;
  }
  await ticketAudit({ action: "export.created", actor: { id: actor.id, name: actor.name }, eventId: eventId ?? null, summary: `Export '${kind}' (${format})`, meta: { kind, format, personal: kind === "tickets" && actor.access.can("tickets:personal") } });
  return { body, name, type };
}
