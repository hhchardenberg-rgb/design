import { prisma } from "@/lib/prisma";

// Auditlog van HHC Tickets. Schrijven mag een handeling nooit laten mislukken, behalve
// binnen een transactie (dan gaat het mee in dezelfde transactie). Geen persoonsgegevens
// in `meta` of `summary`: alleen id's, statussen en redenen.

export const TICKET_AUDIT_ACTIONS = {
  "ticket.created": "Ticket aangemaakt",
  "ticket.blocked": "Ticket geblokkeerd",
  "ticket.cancelled": "Ticket geannuleerd",
  "ticket.reactivated": "Ticket opnieuw geactiveerd",
  "ticket.reissued": "Ticket opnieuw uitgegeven (oude QR ongeldig)",
  "ticket.link_revoked": "Ticketlink ingetrokken",
  "ticket.updated": "Ticketgegevens gewijzigd",
  "ticket.transferred": "Ticket overgedragen aan een andere houder",
  "ticket.anonymized": "Persoonsgegevens geanonimiseerd",
  "ticket.mailed": "Ticket per e-mail verstuurd",
  "ticket.link_shared": "Ticketlink gedeeld",
  "template.updated": "E-mailtemplate gewijzigd",
  "scanner.login": "Scanner ingelogd",
  "scanner.saved": "Scanner opgeslagen",
  "scanner.pin_reset": "Scanner-PIN opnieuw ingesteld",
  "entrance.saved": "Ingang opgeslagen",
  "ticket.scanned": "Ticket gescand",
  "scan.override": "Scan handmatig overruled",
  "scan.manual": "Ticket handmatig ingecheckt",
  "batch.requested": "Bulkuitgifte aangevraagd",
  "batch.approved": "Bulkuitgifte goedgekeurd",
  "batch.rejected": "Bulkuitgifte afgewezen",
  "batch.issued": "Bulkuitgifte uitgegeven",
  "event.created": "Wedstrijd aangemaakt",
  "event.updated": "Wedstrijd gewijzigd",
  "type.created": "Tickettype aangemaakt",
  "type.updated": "Tickettype gewijzigd",
  "zone.saved": "Vak opgeslagen",
  "season.saved": "Seizoen opgeslagen",
  "settings.updated": "Instellingen gewijzigd",
  "export.created": "Export gemaakt",
  "sync.completed": "Synchronisatie uitgevoerd",
  "sync.failed": "Synchronisatie mislukt",
} as const;
export type TicketAuditAction = keyof typeof TICKET_AUDIT_ACTIONS;

export interface TicketAuditInput {
  action: TicketAuditAction;
  actor?: { id?: string | null; name?: string | null } | null;
  ticketId?: string | null;
  eventId?: string | null;
  batchId?: string | null;
  scannerId?: string | null;
  entrance?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  device?: string | null;
  ip?: string | null;
  summary?: string;
  meta?: Record<string, unknown>;
}

type Db = Pick<typeof prisma, "ticketAuditEvent">;

export function ticketAuditData(e: TicketAuditInput) {
  return {
    action: e.action,
    actorId: e.actor?.id ?? null,
    actorName: e.actor?.name ?? null,
    ticketId: e.ticketId ?? null,
    eventId: e.eventId ?? null,
    batchId: e.batchId ?? null,
    scannerId: e.scannerId ?? null,
    entrance: e.entrance ?? null,
    oldStatus: e.oldStatus ?? null,
    newStatus: e.newStatus ?? null,
    reason: e.reason?.slice(0, 500) ?? null,
    device: e.device ?? null,
    ip: e.ip ?? null,
    summary: (e.summary ?? TICKET_AUDIT_ACTIONS[e.action]).slice(0, 500),
    meta: e.meta ? (JSON.parse(JSON.stringify(e.meta)) as object) : undefined,
  };
}

/** Binnen een transactie: fouten gaan mee (dan wordt de handeling ook teruggedraaid). */
export async function ticketAuditTx(db: Db, e: TicketAuditInput) {
  await db.ticketAuditEvent.create({ data: ticketAuditData(e) });
}

/** Buiten een transactie: een fout wordt gelogd en laat de handeling niet mislukken. */
export async function ticketAudit(e: TicketAuditInput) {
  try {
    await prisma.ticketAuditEvent.create({ data: ticketAuditData(e) });
  } catch (error) {
    console.error("[tickets-audit] vastleggen mislukt", e.action, error);
  }
}
