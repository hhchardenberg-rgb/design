import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { effectiveRoles } from "@/lib/roles";
import { roleNamesOf } from "@/lib/access/service.server";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { effectiveDigestFrequency, isDigestFrequency } from "@/lib/commercial/digest-frequency";
import { loadDefaultDigestFrequency } from "@/lib/commercial/reminder-settings.server";

export interface ProfileInput {
  name?: string;
  phone?: string | null;
  jobTitle?: string | null;
  notifyCommercialDigest?: boolean;
  /** Eigen frequentie van de herinneringsmail; null = standaard van Commerciële Zaken volgen. */
  commercialDigestFrequency?: string | null;
}

const optional = (v: string | null | undefined, max: number, what: string): string | null | undefined => {
  if (v === undefined) return undefined;
  const t = (v ?? "").trim();
  if (t.length > max) throw new ApiError(400, `${what} mag maximaal ${max} tekens zijn.`);
  return t || null;
};

/** Eigen profiel: gegevens, voorkeuren en een leesbaar overzicht van de onderdelen waar je bij hoort. */
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, roles: true, phone: true, jobTitle: true, notifyCommercialDigest: true, commercialDigestFrequency: true, createdAt: true, totpCredential: { select: { id: true } }, webauthnCredentials: { select: { id: true } } },
  });
  if (!user) throw new ApiError(404, "Account niet gevonden.");
  const roles = effectiveRoles(user);
  const access = await loadCommercialAccess(userId).catch(() => null);
  const defaultFrequency = await loadDefaultDigestFrequency();
  const roleNames = await roleNamesOf(userId);
  const czRoleNames = access?.isMember
    ? (await prisma.userAccessRole.findMany({ where: { userId, role: { commercialRoleId: { not: null } } }, select: { role: { select: { name: true } } } })).map((r) => r.role.name)
    : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    jobTitle: user.jobTitle,
    notifyCommercialDigest: user.notifyCommercialDigest,
    // Eigen keuze (null = standaard volgen); wie de mail vroeger uitvinkte, staat op "uit".
    commercialDigestFrequency: user.notifyCommercialDigest ? (isDigestFrequency(user.commercialDigestFrequency) ? user.commercialDigestFrequency : null) : "OFF",
    commercialDigestDefault: defaultFrequency,
    commercialDigestEffective: effectiveDigestFrequency(user, defaultFrequency),
    memberSince: user.createdAt.toISOString(),
    roles: roleNames,
    commercial: access?.isMember ? { member: true, roleName: roles.includes("ADMIN") ? "Volledige toegang (hoofdadmin)" : czRoleNames.join(", ") || null } : { member: false, roleName: null },
    security: { totp: !!user.totpCredential, passkeys: user.webauthnCredentials.length },
  };
}

export async function updateProfile(userId: string, input: ProfileInput) {
  const data: { name?: string; phone?: string | null; jobTitle?: string | null; notifyCommercialDigest?: boolean; commercialDigestFrequency?: string | null } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ApiError(400, "Naam is verplicht.");
    if (name.length > 100) throw new ApiError(400, "Naam mag maximaal 100 tekens zijn.");
    data.name = name;
  }
  const phone = optional(input.phone, 30, "Telefoonnummer");
  if (phone !== undefined) {
    if (phone && !/^[0-9+()\-\s]{6,30}$/.test(phone)) throw new ApiError(400, "Gebruik alleen cijfers, spaties en + ( ) - in het telefoonnummer.");
    data.phone = phone;
  }
  const jobTitle = optional(input.jobTitle, 80, "Functie");
  if (jobTitle !== undefined) data.jobTitle = jobTitle;
  if (input.notifyCommercialDigest !== undefined) data.notifyCommercialDigest = !!input.notifyCommercialDigest;
  if (input.commercialDigestFrequency !== undefined) {
    const f = input.commercialDigestFrequency;
    if (f !== null && !isDigestFrequency(f)) throw new ApiError(400, "Onbekende frequentie voor de herinneringsmail.");
    // "Uit" blijft ook in het oude vinkje staan, zodat uit altijd uit is.
    data.commercialDigestFrequency = f === "OFF" ? null : f;
    data.notifyCommercialDigest = f !== "OFF";
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, "Er is niets om op te slaan.");
  await prisma.user.update({ where: { id: userId }, data });
}

/** Wachtwoord wijzigen vereist het huidige wachtwoord; het nieuwe moet verschillen. */
export async function changePassword(userId: string, current: string, next: string) {
  if (!current) throw new ApiError(400, "Vul je huidige wachtwoord in.");
  if (typeof next !== "string" || next.length < 8) throw new ApiError(400, "Wachtwoord moet minimaal 8 tekens zijn.");
  if (next.length > 200) throw new ApiError(400, "Wachtwoord is te lang.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new ApiError(404, "Account niet gevonden.");
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new ApiError(403, "Je huidige wachtwoord klopt niet.");
  if (current === next) throw new ApiError(400, "Kies een ander wachtwoord dan je huidige.");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12) } });
}
