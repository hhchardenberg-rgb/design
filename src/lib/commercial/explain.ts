import type { EffectivePermission, Source } from "./evaluate";
import { AREAS, ACTIONS, splitPermission, type Permission } from "./permissions";

export function describeSource(source: Source): string {
  switch (source.kind) {
    case "role":
      return "Via de rollen";
    case "override-allow":
      return "Individueel toegestaan";
    case "override-deny":
      return "Individueel geblokkeerd";
    case "missing-requirement": {
      const { area, action } = splitPermission(source.missing);
      return `Vervalt: '${ACTIONS[action].label}' bij '${AREAS[area].label}' ontbreekt`;
    }
    case "none":
      return source.reason === "no-section" ? "Geen toegang tot de sectie" : "Niet toegekend";
  }
}

export interface EffectiveRow {
  permission: Permission;
  allowed: boolean;
  source: string;
}

export function summarize(effective: Map<Permission, EffectivePermission>): EffectiveRow[] {
  return [...effective].map(([permission, e]) => ({ permission, allowed: e.allowed, source: describeSource(e.source) }));
}
