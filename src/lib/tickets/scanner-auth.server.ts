import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auth } from "@/lib/auth";
import { ticketAudit } from "./audit.server";
import { loadTicketsAccess } from "./authz.server";
import { isTicketsEnabled } from "./flag";
import { signSession, verifySession } from "./token";

// Scanners loggen in met een korte code en een PIN (geen Hub-account). Beheerders met een
// Hub-account en de bevoegdheid "scan:scan" scannen met hun eigen sessie. De sessie van een
// scanner is een ondertekende, korte code; de scanner zelf wordt bij elk verzoek uit de
// database gelezen, zodat uitschakelen of een nieuwe PIN direct werkt.

const SESSION_HOURS = 14;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
// Voor een gelijke rekentijd bij een onbekende code (geen aanwijzing welke codes bestaan).
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("geen-scanner", 10));

export const newLoginCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
export const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const hashPin = (pin: string) => bcrypt.hash(pin, 10);

export interface ScanActor {
  kind: "scanner" | "user";
  /** Naam voor logs en schermen. */
  name: string;
  scannerId: string | null;
  userId: string | null;
  entranceId: string | null;
  canOverride: boolean;
  /** Hub-account met inzicht in historie en aantallen. */
  canSeeStats: boolean;
}

export async function scannerLogin(rawCode: string, pin: string, ip: string | null) {
  if (!isTicketsEnabled()) throw new ApiError(404, "Niet gevonden.");
  const code = rawCode.trim().toUpperCase();
  const scanner = await prisma.ticketScanner.findUnique({ where: { loginCode: code } });
  const now = new Date();
  const locked = (until: Date | null) =>
    new ApiError(429, `Te vaak een foute PIN. Probeer het over ${Math.max(1, Math.ceil(((until?.getTime() ?? now.getTime() + LOCK_MINUTES * 60000) - now.getTime()) / 60000))} minuten opnieuw, of vraag een beheerder.`);
  const lockNow = (id: string) => prisma.ticketScanner.update({ where: { id }, data: { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60000) } });
  if (scanner?.lockedUntil && scanner.lockedUntil > now) throw locked(scanner.lockedUntil);
  if (scanner) {
    // Elke poging vooraf (atomair) meetellen, zodat gelijktijdige verzoeken samen nooit meer dan
    // MAX_FAILURES PIN's kunnen proberen voordat de blokkade ingaat.
    const reserved = await prisma.ticketScanner.updateMany({
      where: { id: scanner.id, failedAttempts: { lt: MAX_FAILURES }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { failedAttempts: { increment: 1 } },
    });
    if (reserved.count === 0) {
      const cur = await prisma.ticketScanner.findUnique({ where: { id: scanner.id }, select: { lockedUntil: true } });
      if (cur?.lockedUntil && cur.lockedUntil > now) throw locked(cur.lockedUntil);
      // Alle pogingen op, maar (nog) geen blokkade vastgelegd: nu blokkeren.
      await lockNow(scanner.id);
      throw locked(null);
    }
  }
  const ok = await bcrypt.compare(pin, scanner?.pinHash ?? getDummyHash());
  if (!scanner || !scanner.active || !ok) {
    if (scanner) {
      const cur = await prisma.ticketScanner.findUnique({ where: { id: scanner.id }, select: { failedAttempts: true } });
      if (cur && cur.failedAttempts >= MAX_FAILURES) await lockNow(scanner.id);
    }
    throw new ApiError(401, "Code of PIN klopt niet.");
  }
  await prisma.ticketScanner.update({ where: { id: scanner.id }, data: { failedAttempts: 0, lockedUntil: null, lastSeenAt: now } });
  await ticketAudit({ action: "scanner.login", scannerId: scanner.id, ip, summary: `Scanner '${scanner.name}' ingelogd` });
  const exp = Math.floor(now.getTime() / 1000) + SESSION_HOURS * 3600;
  return { token: signSession(`SCN.${scanner.id}.${scanner.tokenVersion}.${exp}`), name: scanner.name, supervisor: scanner.supervisor, entranceId: scanner.entranceId, expiresAt: new Date(exp * 1000).toISOString() };
}

async function fromScannerToken(token: string): Promise<ScanActor | null> {
  const body = verifySession(token);
  if (!body) return null;
  const [kind, id, version, exp] = body.split(".");
  if (kind !== "SCN" || Number(exp) * 1000 < Date.now()) return null;
  const s = await prisma.ticketScanner.findUnique({ where: { id } });
  if (!s || !s.active || s.tokenVersion !== Number(version)) return null;
  // Niet bij elk verzoek schrijven: hooguit eens per minuut.
  if (!s.lastSeenAt || Date.now() - s.lastSeenAt.getTime() > 60000) await prisma.ticketScanner.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return { kind: "scanner", name: s.name, scannerId: s.id, userId: null, entranceId: s.entranceId, canOverride: s.supervisor, canSeeStats: false };
}

/** Scanner-token (Bearer) of Hub-sessie met scan:scan. Flag uit → 404. */
export async function requireScanActor(req: Request): Promise<ScanActor> {
  if (!isTicketsEnabled()) throw new ApiError(404, "Niet gevonden.");
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const a = await fromScannerToken(bearer);
    if (!a) throw new ApiError(401, "Je scannersessie is verlopen. Log opnieuw in.");
    return a;
  }
  const session = await auth();
  if (!session?.user) throw new ApiError(401, "Niet ingelogd.");
  if (session.user.mfaSetupRequired) throw new ApiError(403, "Stel eerst tweestapsverificatie in via Profiel > Beveiliging.");
  const access = await loadTicketsAccess(session.user.id);
  if (!access.can("scan:scan")) throw new ApiError(403, "Je hebt geen bevoegdheid om te scannen.");
  return { kind: "user", name: session.user.name || session.user.email || "Beheerder", scannerId: null, userId: session.user.id, entranceId: null, canOverride: access.can("scan:override"), canSeeStats: access.can("scan:history") };
}
