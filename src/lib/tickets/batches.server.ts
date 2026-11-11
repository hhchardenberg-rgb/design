import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAuditTx } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { batchReviewSchema, issueSchema } from "./schemas";
import { createTickets, prepareIssue } from "./tickets.server";

// Bulkuitgiftes boven de drempel: aanvragen, goedkeuren (door iemand anders) of afwijzen.

export async function listBatches() {
  const rows = await prisma.ticketBatch.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { tickets: true } } } });
  return rows.map(({ payload, ...b }) => ({ ...b, issuedCount: b._count.tickets, hasPayload: payload != null }));
}

export async function reviewBatch(actor: TicketsActor, id: string, raw: unknown) {
  need(actor, "bulk:approve");
  const input = batchReviewSchema.parse(raw);
  const batch = await prisma.ticketBatch.findUnique({ where: { id } });
  if (!batch) throw new ApiError(404, "Bulkuitgifte niet gevonden.");
  if (batch.status !== "PENDING_APPROVAL") throw new ApiError(409, "Deze bulkuitgifte is al beoordeeld.");
  if (batch.requestedById === actor.id) throw new ApiError(403, "Je kunt je eigen bulkuitgifte niet goedkeuren of afwijzen. Vraag een andere bevoegde collega.");
  const actorRef = { id: actor.id, name: actor.name };

  if (input.decision === "reject") {
    await prisma.$transaction(async (tx) => {
      const res = await tx.ticketBatch.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { status: "REJECTED", reviewedById: actor.id, reviewedBy: actor.name, reviewNote: input.note, reviewedAt: new Date(), payload: undefined },
      });
      if (res.count !== 1) throw new ApiError(409, "Deze bulkuitgifte is al beoordeeld.");
      // De ingelezen persoonsgegevens zijn niet meer nodig.
      await tx.$executeRaw`UPDATE "tickets_batches" SET "payload" = NULL WHERE "id" = ${id}`;
      await ticketAuditTx(tx, { action: "batch.rejected", actor: actorRef, batchId: id, oldStatus: "PENDING_APPROVAL", newStatus: "REJECTED", reason: input.note });
    });
    return { status: "REJECTED" };
  }

  // Opnieuw volledig controleren: wedstrijden of types kunnen sinds de aanvraag gewijzigd zijn.
  const parsed = issueSchema.safeParse(batch.payload);
  if (!parsed.success) throw new ApiError(400, "De gegevens van deze aanvraag zijn niet meer bruikbaar. Wijs hem af en vraag hem opnieuw aan.");
  const prepared = await prepareIssue(parsed.data);
  const requester = { id: batch.requestedById, name: batch.requestedBy ?? "Onbekend" };

  const count = await prisma.$transaction(
    async (tx) => {
      const res = await tx.ticketBatch.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { status: "ISSUED", reviewedById: actor.id, reviewedBy: actor.name, reviewNote: input.note, reviewedAt: new Date(), issuedAt: new Date() },
      });
      if (res.count !== 1) throw new ApiError(409, "Deze bulkuitgifte is al beoordeeld.");
      await ticketAuditTx(tx, { action: "batch.approved", actor: actorRef, batchId: id, oldStatus: "PENDING_APPROVAL", newStatus: "ISSUED", reason: input.note, meta: { count: prepared.holders.length } });
      // De tickets staan op naam van de aanvrager; de goedkeuring staat in het auditlog.
      const ids = await createTickets(tx, requester, prepared, { batchId: id });
      await tx.$executeRaw`UPDATE "tickets_batches" SET "payload" = NULL WHERE "id" = ${id}`;
      return ids.length;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  return { status: "ISSUED", count };
}
