// Eenduidige evaluatie van effectieve rechten (opdracht 4.3):
//  1. Zonder sectietoegang geen toegang.
//  2. Roltoestemmingen leveren de basisrechten.
//  3. Toegestane individuele uitzonderingen worden toegepast.
//  4. Een expliciete individuele blokkade wint.
//  5. Vereiste bevoegdheden (bv. lezen bij wijzigen) blijven gelden.
// Recordbereik en aanvullende beveiligingsvoorwaarden worden daarna per
// object gecontroleerd (zie authz.server.ts); dit bestand is bewust zuiver.

import { ALL_PERMISSIONS, requiredPermissions, type Permission } from "./permissions";

export type OverrideEffect = "ALLOW" | "DENY";

export interface EvaluationInput {
  hasSectionAccess: boolean;
  rolePermissions: readonly Permission[];
  overrides: readonly { permission: Permission; effect: OverrideEffect }[];
}

export type Source =
  | { kind: "none"; reason: "no-section" | "not-granted" }
  | { kind: "role" }
  | { kind: "override-allow" }
  | { kind: "override-deny" }
  | { kind: "missing-requirement"; missing: Permission };

export interface EffectivePermission {
  allowed: boolean;
  source: Source;
}

export function evaluate(input: EvaluationInput): Map<Permission, EffectivePermission> {
  const result = new Map<Permission, EffectivePermission>();

  if (!input.hasSectionAccess) {
    for (const p of ALL_PERMISSIONS) result.set(p, { allowed: false, source: { kind: "none", reason: "no-section" } });
    return result;
  }

  const fromRole = new Set(input.rolePermissions);
  const allow = new Set(input.overrides.filter((o) => o.effect === "ALLOW").map((o) => o.permission));
  const deny = new Set(input.overrides.filter((o) => o.effect === "DENY").map((o) => o.permission));

  // Stap 2-4: rol, toegestaan, blokkade wint.
  const stage1 = new Map<Permission, EffectivePermission>();
  for (const p of ALL_PERMISSIONS) {
    if (deny.has(p)) stage1.set(p, { allowed: false, source: { kind: "override-deny" } });
    else if (allow.has(p)) stage1.set(p, { allowed: true, source: { kind: "override-allow" } });
    else if (fromRole.has(p)) stage1.set(p, { allowed: true, source: { kind: "role" } });
    else stage1.set(p, { allowed: false, source: { kind: "none", reason: "not-granted" } });
  }

  // Stap 5: een bevoegdheid zonder de vereiste leesrechten vervalt.
  for (const p of ALL_PERMISSIONS) {
    const current = stage1.get(p)!;
    if (!current.allowed) {
      result.set(p, current);
      continue;
    }
    const missing = requiredPermissions(p).find((req) => !stage1.get(req)!.allowed);
    result.set(p, missing ? { allowed: false, source: { kind: "missing-requirement", missing } } : current);
  }
  return result;
}

export function allowedSet(effective: Map<Permission, EffectivePermission>): Set<Permission> {
  return new Set([...effective].filter(([, v]) => v.allowed).map(([k]) => k));
}
