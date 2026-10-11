import type { PrismaClient } from "@prisma/client";

// Rate limiting voor inloggen (zie prisma/schema.prisma's LoginAttempt-model
// voor waarom dit database-backed is i.p.v. in-memory). Twee onafhankelijke
// drempels:
//  - per e-mailadres: stopt brute-force/credential-stuffing tegen één
//    specifiek (bestaand of verzonnen) account.
//  - per IP-adres: stopt password spraying — veel verschillende
//    e-mailadressen vanaf hetzelfde adres proberen.
// Beide tellen mislukte pogingen binnen een glijdend tijdvenster; een
// geslaagde login telt niet mee (en wordt alsnog gelogd, voor eventuele
// toekomstige "nieuwe inlogactiviteit"-detectie).
const EMAIL_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_MAX_FAILURES = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILURES = 20;

// Hoelang mislukte-pogingen-rijen bewaard blijven voor de opportunistische
// opruiming (ruim boven het langste tijdvenster hierboven).
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds?: number;
}

/**
 * Haalt het client-IP op uit standaard reverse-proxy-headers (Vercel zet
 * x-forwarded-for). Geen betrouwbare bron bij zelf-hosten achter een
 * ongecontroleerde proxy, maar op Vercel (waar deze app draait) correct.
 */
export function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "onbekend";
}

/** Controleert vóór het dure bcrypt-vergelijk of deze poging geblokkeerd moet worden. */
export async function checkLoginRateLimit(
  prisma: PrismaClient,
  email: string,
  ip: string
): Promise<RateLimitResult> {
  const now = Date.now();

  const [emailFailures, ipFailures] = await Promise.all([
    prisma.loginAttempt.count({
      where: { email, success: false, createdAt: { gte: new Date(now - EMAIL_WINDOW_MS) } },
    }),
    prisma.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: new Date(now - IP_WINDOW_MS) } },
    }),
  ]);

  if (emailFailures >= EMAIL_MAX_FAILURES) {
    return { limited: true, retryAfterSeconds: Math.ceil(EMAIL_WINDOW_MS / 1000) };
  }
  if (ipFailures >= IP_MAX_FAILURES) {
    return { limited: true, retryAfterSeconds: Math.ceil(IP_WINDOW_MS / 1000) };
  }
  return { limited: false };
}

/** Legt het resultaat van een inlogpoging vast en ruimt oude rijen op. */
export async function recordLoginAttempt(
  prisma: PrismaClient,
  email: string,
  ip: string,
  success: boolean
): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, ip, success } });

  // Opportunistische opruiming: ~1 op de 20 pogingen ruimt oude rijen op,
  // zodat de tabel niet onbeperkt groeit zonder dat daar een aparte
  // geplande taak voor nodig is.
  if (Math.random() < 0.05) {
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }
}
