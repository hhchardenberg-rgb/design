import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// Beperking voor openbare ticket-eindpunten. Database-backed (net als bij inloggen), want
// op Vercel deelt geen enkele serverless-instantie geheugen. Sleutels zijn hashes.

const hash = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

/** Telt de poging en meldt of de limiet is bereikt. De poging telt altijd mee, ook als hij wordt geweigerd. */
export async function hitLimit(kind: string, rawKey: string, max: number, windowMs: number): Promise<boolean> {
  const key = hash(rawKey);
  const since = new Date(Date.now() - windowMs);
  const used = await prisma.ticketPublicHit.count({ where: { kind, key, createdAt: { gte: since } } });
  await prisma.ticketPublicHit.create({ data: { kind, key } });
  // Opportunistisch opruimen (ruim buiten elk venster).
  if (Math.random() < 0.02) await prisma.ticketPublicHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 2 * 86_400_000) } } }).catch(() => {});
  return used >= max;
}

export const emailKey = hash;
