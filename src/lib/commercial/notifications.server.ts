import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { formatDay } from "@/lib/date-format";
import type { ContractNotice } from "./mail-render";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { SEASON_PHASE_LABEL, seasonPhase } from "./season-phase";
import { tierLabel } from "./sponsor-tiers";

// Meldingen per e-mail bij gebeurtenissen in Commerciële Zaken. Voor nu één gebeurtenis: een nieuw sponsorcontract
// is afgesloten (een concept wordt actief). Beheerders wijzen aan wie de melding krijgt: Hub-gebruikers of losse
// e-mailadressen (bv. bestuursleden zonder account).
//
// Previews delen de productiedatabase. Daarom wordt er alleen echt gemaild op productie; elders wordt de
// melding vastgelegd als overgeslagen, zodat je in de preview kunt zien wie hem gekregen zou hebben.

export const CONTRACT_ACTIVATED = "CONTRACT_ACTIVATED";

/** Alleen op productie worden meldingen echt verstuurd. */
export const notificationMailLive = () => process.env.VERCEL_ENV === "production";

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export async function listNotificationRecipients(ctx: RecordCtx) {
  need(ctx, "settings:read");
  const rows = await prisma.commercialNotificationRecipient.findMany({ where: { event: CONTRACT_ACTIVATED }, orderBy: { createdAt: "asc" } });
  const canEdit = ctx.can("settings:manage_settings");
  const users = await prisma.user.findMany({
    where: canEdit ? {} : { id: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const userBy = new Map(users.map((u) => [u.id, u]));
  const chosen = new Set(rows.map((r) => r.userId));
  return {
    live: notificationMailLive(),
    recipients: rows.map((r) => {
      const u = r.userId ? userBy.get(r.userId) : null;
      return { id: r.id, kind: r.userId ? ("user" as const) : ("email" as const), name: u?.name ?? r.name ?? null, email: u?.email ?? r.email ?? null };
    }),
    // Keuzelijst voor beheerders: Hub-gebruikers die er nog niet op staan.
    candidates: canEdit ? users.filter((u) => !chosen.has(u.id)).map((u) => ({ id: u.id, name: u.name, email: u.email })) : [],
  };
}

export async function addNotificationRecipient(ctx: RecordCtx, input: { userId?: string | null; email?: string | null; name?: string | null }) {
  need(ctx, "settings:manage_settings");
  let data: { userId?: string; email?: string; name?: string | null };
  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!user) throw new ApiError(404, "Gebruiker niet gevonden.");
    data = { userId: user.id };
  } else {
    const email = input.email?.trim().toLowerCase() ?? "";
    if (!EMAIL.test(email) || email.length > 200) throw new ApiError(400, "Vul een geldig e-mailadres in.");
    data = { email, name: input.name?.trim().slice(0, 100) || null };
  }
  try {
    const row = await prisma.commercialNotificationRecipient.create({ data: { event: CONTRACT_ACTIVATED, ...data, createdById: ctx.userId } });
    await auditRecord(ctx, { action: "notification_recipient.add", entity: "notification_recipient", entityId: row.id, after: { userId: row.userId, email: row.email } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ApiError(409, "Deze ontvanger staat er al op.");
    throw e;
  }
}

export async function removeNotificationRecipient(ctx: RecordCtx, id: string) {
  need(ctx, "settings:manage_settings");
  const row = await prisma.commercialNotificationRecipient.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "Niet gevonden.");
  await prisma.commercialNotificationRecipient.delete({ where: { id } });
  await auditRecord(ctx, { action: "notification_recipient.remove", entity: "notification_recipient", entityId: id, before: { userId: row.userId, email: row.email } });
}

export type ContractNoticeSender = (to: string, notice: Omit<ContractNotice, "url"> & { path: string }) => Promise<void>;
export interface NotifyResult { recipients: number; sent: number; failed: number; skipped: number; live: boolean }

/**
 * Meldt een nieuw afgesloten contract aan alle aangewezen ontvangers. Per contract en adres hooguit één keer
 * (unieke vastlegging vóór verzenden). Gooit niet: een mislukte melding mag het activeren niet tegenhouden.
 */
export async function notifyContractActivated(contractId: string, actorUserId: string | null, send: ContractNoticeSender, opts: { live?: boolean } = {}): Promise<NotifyResult> {
  const live = opts.live ?? notificationMailLive();
  const result: NotifyResult = { recipients: 0, sent: 0, failed: 0, skipped: 0, live };
  try {
    const [contract, rows] = await Promise.all([
      prisma.commercialContract.findUnique({ where: { id: contractId }, include: { company: { select: { name: true, sponsorTier: true } }, season: true, package: { select: { name: true } } } }),
      prisma.commercialNotificationRecipient.findMany({ where: { event: CONTRACT_ACTIVATED } }),
    ]);
    if (!contract || contract.status !== "ACTIVE" || rows.length === 0) return result;
    const userIds = [...rows.map((r) => r.userId), actorUserId].filter((x): x is string => !!x);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    const userBy = new Map(users.map((u) => [u.id, u]));
    const addresses = [...new Set(rows.map((r) => (r.userId ? userBy.get(r.userId)?.email : r.email)?.trim().toLowerCase()).filter((x): x is string => !!x))];
    result.recipients = addresses.length;

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const snapshotName = (contract.packageSnapshot as { name?: string } | null)?.name ?? null;
    const notice = {
      companyName: contract.company.name,
      tier: tierLabel(contract.company.sponsorTier),
      season: SEASON_PHASE_LABEL[seasonPhase({ startsOn: iso(contract.season.startsOn), endsOn: iso(contract.season.endsOn) })],
      packageName: contract.package?.name ?? snapshotName,
      startsOn: formatDay(iso(contract.startsOn)),
      endsOn: formatDay(iso(contract.endsOn)),
      actorName: actorUserId ? (userBy.get(actorUserId)?.name ?? null) : null,
      path: `/commercieel/sponsoren/${contract.companyId}`,
    };

    for (const address of addresses) {
      try {
        await prisma.commercialNotificationLog.create({ data: { event: CONTRACT_ACTIVATED, refId: contractId, address, status: live ? "PENDING" : "SKIPPED_PREVIEW" } });
      } catch {
        continue; // al eerder gemeld
      }
      if (!live) { result.skipped += 1; continue; }
      try {
        await send(address, notice);
        await prisma.commercialNotificationLog.update({ where: { event_refId_address: { event: CONTRACT_ACTIVATED, refId: contractId, address } }, data: { status: "SENT" } });
        result.sent += 1;
      } catch (e) {
        result.failed += 1;
        await prisma.commercialNotificationLog.update({
          where: { event_refId_address: { event: CONTRACT_ACTIVATED, refId: contractId, address } },
          data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) },
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[meldingen] nieuw contract melden mislukt:", e);
  }
  return result;
}
