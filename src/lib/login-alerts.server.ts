import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { formatDayTime } from "@/lib/date-format";
import { sendLoginLockedEmail, sendNewDeviceEmail } from "@/lib/mail";
import { EMAIL_MAX_FAILURES, EMAIL_WINDOW_MS } from "@/lib/login-rate-limit";

/** Naam van de apparaatcookie die src/proxy.ts zet (willekeurige waarde, alleen als hash bewaard). */
export const DEVICE_COOKIE = "hhc_device";

const mailLive = () => process.env.VERCEL_ENV === "production";

function cookieValue(request: Request | undefined, name: string): string | null {
  const header = request?.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Korte, leesbare omschrijving van browser en systeem, bv. "Chrome op Windows". */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "een browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "onbekend systeem";
  return `${browser} op ${os}`;
}

interface LoginUser {
  id: string;
  name: string;
  email: string;
}

/** Na een geslaagde login: vastleggen, en een mail als het een nieuw apparaat is. */
export async function noteSuccessfulLogin(input: { user: LoginUser; ip: string; request?: Request; method: string }) {
  const { user, ip, request } = input;
  const ua = request?.headers.get("user-agent");
  const label = deviceLabel(ua);
  await audit({ action: "auth.login", actor: user, target: { type: "user", id: user.id, name: user.name }, summary: `Ingelogd (${input.method}, ${label})`, ip });

  const device = cookieValue(request, DEVICE_COOKIE);
  if (!device) return;
  try {
    const deviceHash = createHash("sha256").update(device).digest("hex");
    const existing = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId: user.id, deviceHash } } });
    if (existing) {
      await prisma.knownDevice.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
      return;
    }
    const known = await prisma.knownDevice.count({ where: { userId: user.id } });
    await prisma.knownDevice.create({ data: { userId: user.id, deviceHash, label } });
    // Het allereerste apparaat na deze functie is geen nieuws; alles daarna wel.
    if (known === 0) return;
    await audit({ action: "auth.new_device", actor: user, target: { type: "user", id: user.id, name: user.name }, summary: `Ingelogd vanaf nieuw apparaat: ${label}`, ip });
    if (mailLive()) await sendNewDeviceEmail(user.email, user.name, { when: formatDayTime(new Date()), device: label, ip });
  } catch (error) {
    console.error("[login-alerts] apparaat vastleggen of mailen mislukt", error);
  }
}

/** Na een mislukte poging: vastleggen, en bij het bereiken van de blokkade één mail aan de eigenaar. */
export async function noteFailedLogin(input: { email: string; ip: string; user: LoginUser | null; reason: "password" | "second-factor" }) {
  const { email, ip, user } = input;
  await audit({
    action: "auth.login_failed",
    target: { type: "user", id: user?.id ?? null, name: user?.name ?? email },
    summary: input.reason === "password" ? `Inloggen mislukt voor ${email} (wachtwoord)` : `Inloggen mislukt voor ${email} (tweede stap)`,
    ip,
  });
  if (!user) return;
  try {
    const failures = await prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: new Date(Date.now() - EMAIL_WINDOW_MS) } } });
    if (failures !== EMAIL_MAX_FAILURES) return; // precies bij het bereiken van de grens: één melding per blokkade
    await audit({ action: "auth.locked", target: { type: "user", id: user.id, name: user.name }, summary: `${failures} mislukte pogingen, account een kwartier geblokkeerd`, ip });
    if (mailLive()) await sendLoginLockedEmail(user.email, user.name, { when: formatDayTime(new Date()), attempts: failures, ip });
  } catch (error) {
    console.error("[login-alerts] blokkade melden mislukt", error);
  }
}
