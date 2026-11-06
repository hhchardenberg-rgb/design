import { prisma } from "@/lib/prisma";

/**
 * Audit-log van de hele Hub: wie deed wat, wanneer. Schrijven mag nooit een handeling laten
 * mislukken; een fout wordt alleen gelogd. Bekijken: Beheer > Audit-log (alleen hoofdadmin).
 * Bewaartermijn: zie AUDIT_RETENTION_DAYS (opgeruimd door de nachtelijke back-up-cron).
 */
export const AUDIT_RETENTION_DAYS = 400;

export const AUDIT_ACTIONS = {
  "auth.login": "Ingelogd",
  "auth.login_failed": "Inloggen mislukt",
  "auth.locked": "Te veel mislukte pogingen",
  "auth.new_device": "Ingelogd vanaf nieuw apparaat",
  "auth.logout_all": "Overal uitgelogd",
  "auth.password_changed": "Wachtwoord gewijzigd",
  "auth.password_reset": "Wachtwoord hersteld via e-mail",
  "auth.mfa_enabled": "Tweestapsverificatie aangezet",
  "auth.mfa_disabled": "Tweestapsverificatie uitgezet",
  "auth.passkey_added": "Passkey toegevoegd",
  "auth.passkey_removed": "Passkey verwijderd",
  "auth.recovery_codes": "Nieuwe herstelcodes gemaakt",
  "user.created": "Account aangemaakt",
  "user.updated": "Account gewijzigd",
  "user.deleted": "Account verwijderd",
  "user.roles_changed": "Rollen gewijzigd",
  "role.changed": "Rol aangepast",
  "backup.run": "Back-up gemaakt",
  "backup.failed": "Back-up mislukt",
  "backup.download": "Back-up gedownload",
  "data.export": "Gegevens geëxporteerd",
  "file.download": "Sponsorbestand gedownload",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export interface AuditActor {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

export interface AuditInput {
  action: AuditAction;
  actor?: AuditActor | null;
  target?: { type: string; id?: string | null; name?: string | null } | null;
  summary?: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        actorId: input.actor?.id ?? null,
        actorName: input.actor ? input.actor.name || input.actor.email || null : null,
        targetType: input.target?.type ?? null,
        targetId: input.target?.id ?? null,
        targetName: input.target?.name ?? null,
        summary: (input.summary ?? AUDIT_ACTIONS[input.action]).slice(0, 500),
        ip: input.ip ?? null,
        meta: input.meta ? (JSON.parse(JSON.stringify(input.meta)) as object) : undefined,
      },
    });
  } catch (error) {
    console.error("[audit] vastleggen mislukt", input.action, error);
  }
}

/** IP uit de standaard proxyheaders (Vercel zet x-forwarded-for). */
export function ipOf(req: Request | { headers: Headers } | null | undefined): string | null {
  if (!req) return null;
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip");
}

export async function pruneAudit(now = new Date()): Promise<number> {
  const res = await prisma.auditEvent.deleteMany({ where: { at: { lt: new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000) } } });
  return res.count;
}
