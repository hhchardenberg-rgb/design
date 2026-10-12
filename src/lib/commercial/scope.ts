// Recordbereik (opdracht 4.4): eigen / team / alles. Zuivere regels zonder
// database zodat ze volledig testbaar zijn; de services vertalen dit naar
// Prisma-filters en passen het toe op élke lees- en schrijfactie.
//
// Bereik geldt voor onderdelen met duidelijk eigenaarschap: bedrijven
// (dossiers) en taken. Contacten, contacthistorie en bestanden volgen het
// bereik van hun dossier. Zonder ingestelde beperking is het bereik 'alles'
// (de sectietoegang zelf is dan al expliciet verleend).

export type Scope = "OWN" | "TEAM" | "ALL";

export const SCOPED_AREAS = ["companies", "tasks"] as const;
export type ScopedArea = (typeof SCOPED_AREAS)[number];

export const SCOPE_LABEL: Record<Scope, string> = { OWN: "Alleen eigen", TEAM: "Eigen team", ALL: "Alles" };
export const DEFAULT_SCOPE: Scope = "ALL";

const RANK: Record<Scope, number> = { OWN: 0, TEAM: 1, ALL: 2 };

export function isScope(v: string): v is Scope {
  return v === "OWN" || v === "TEAM" || v === "ALL";
}

/** Je mag een ander nooit een ruimer bereik geven dan je zelf hebt. */
export function scopeWithinLimit(requested: Scope, actorScope: Scope): boolean {
  return RANK[requested] <= RANK[actorScope];
}

export interface Viewer {
  userId: string;
  teamIds: readonly string[];
}

export interface Owned {
  ownerId: string | null;
  teamId: string | null;
}

export function canSeeOwned(scope: Scope, rec: Owned, viewer: Viewer): boolean {
  if (scope === "ALL") return true;
  if (rec.ownerId === viewer.userId) return true;
  if (scope === "TEAM" && rec.teamId !== null && viewer.teamIds.includes(rec.teamId)) return true;
  return false;
}

/** Prisma-filter voor bedrijven (eigenaar = ownerId). */
export function companyScopeWhere(scope: Scope, viewer: Viewer) {
  if (scope === "ALL") return {};
  const or: object[] = [{ ownerId: viewer.userId }];
  if (scope === "TEAM" && viewer.teamIds.length > 0) or.push({ teamId: { in: [...viewer.teamIds] } });
  return { OR: or };
}

/** Taken: 'eigen' = toegewezen aan of aangemaakt door jou; team via teamId. */
export function taskScopeWhere(scope: Scope, viewer: Viewer) {
  if (scope === "ALL") return {};
  const or: object[] = [{ assigneeId: viewer.userId }, { createdById: viewer.userId }];
  if (scope === "TEAM" && viewer.teamIds.length > 0) or.push({ teamId: { in: [...viewer.teamIds] } });
  return { OR: or };
}

export function canSeeTask(
  scope: Scope,
  task: { assigneeId: string | null; createdById: string | null; teamId: string | null },
  viewer: Viewer,
): boolean {
  if (scope === "ALL") return true;
  if (task.assigneeId === viewer.userId || task.createdById === viewer.userId) return true;
  return scope === "TEAM" && task.teamId !== null && viewer.teamIds.includes(task.teamId);
}

/** Genormaliseerde bedrijfsnaam voor dubbelcontrole. */
export function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(bv|nv|vof|holding)$/, "");
}
