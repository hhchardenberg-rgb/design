"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ACTIONS,
  AREAS,
  AREA_KEYS,
  levelFor,
  perm,
  permissionsForLevel,
  type Action,
  type AreaKey,
  type Level,
  type Permission,
} from "@/lib/commercial/permissions";

export interface EffectiveRow {
  permission: Permission;
  allowed: boolean;
  source: string;
}
export interface Member {
  userId: string;
  name: string;
  email: string;
  roleId: string | null;
  roleName: string | null;
  scopes: Record<"companies" | "tasks", "OWN" | "TEAM" | "ALL">;
  effective: EffectiveRow[];
}
export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
}
export interface AuditRow {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  targetUserId: string | null;
}
export interface Overview {
  members: Member[];
  roles: Role[];
  audit: AuditRow[];
  grantable: Permission[];
  actorUserId: string;
}

const LEVEL_LABEL: Record<Level, string> = { none: "Geen toegang", read: "Alleen lezen", edit: "Lezen en bewerken" };
const GROUPS = ["Relaties", "Afspraken", "Financiën", "Communicatie", "Beheer"] as const;
export const ACTION_NAMES: Record<string, string> = {
  "member.role": "Rol gewijzigd",
  "member.permissions": "Rechten gewijzigd",
  "membership.grant": "Toegang gegeven",
  "membership.revoke": "Toegang ingetrokken",
  "role.create": "Rol aangemaakt",
  "role.update": "Rol gewijzigd",
};

export function toSet(rows: EffectiveRow[]): Set<Permission> {
  return new Set(rows.filter((r) => r.allowed).map((r) => r.permission));
}

/** Matrix van bevoegdheden per onderdeel, gebruikt voor zowel leden als rollen. */
export function Matrix({
  value,
  onChange,
  disabled,
  grantable,
  sources,
}: {
  value: Set<Permission>;
  onChange: (next: Set<Permission>) => void;
  disabled: boolean;
  /** Welke bevoegdheden mogen worden toegevoegd; ontbreekt = alles (afbakening gebeurt server-side). */
  grantable?: Set<Permission>;
  sources?: Map<Permission, string>;
}) {
  const [open, setOpen] = useState<Set<AreaKey>>(new Set());
  const canAdd = (p: Permission) => !grantable || grantable.has(p) || value.has(p);

  function setLevel(area: AreaKey, level: Level) {
    const next = new Set(value);
    const current = levelFor(area, value);
    // Eerst alle basisrechten van dit onderdeel weghalen, daarna het gekozen niveau toepassen;
    // aanvullende (risicovolle) acties blijven behouden zolang het leesrecht blijft bestaan.
    for (const a of AREAS[area].actions) next.delete(perm(area, a));
    for (const p of permissionsForLevel(area, level)) if (canAdd(p)) next.add(p);
    if (level !== "none") for (const a of current.extras) if (canAdd(perm(area, a))) next.add(perm(area, a));
    onChange(next);
  }

  function toggle(p: Permission) {
    const next = new Set(value);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange(next);
  }

  return (
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h4>
          <ul className="divide-y divide-border rounded-md border border-border">
            {AREA_KEYS.filter((k) => AREAS[k].group === group).map((key) => {
              const area = AREAS[key];
              const { level, extras } = levelFor(key, value);
              const extraActions = area.actions.filter((a) => !["read", "create", "update"].includes(a));
              const expanded = open.has(key);
              const hasEdit = area.actions.includes("create") || area.actions.includes("update");
              return (
                <li key={key} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {area.label}
                        {area.financial && <Badge className="ml-2" variant="outline">financieel</Badge>}
                        {area.confidential && <Badge className="ml-2" variant="outline">vertrouwelijk</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{area.description}</div>
                    </div>
                    <select
                      aria-label={`Niveau voor ${area.label}`}
                      className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                      disabled={disabled}
                      value={level}
                      onChange={(e) => setLevel(key, e.target.value as Level)}
                    >
                      <option value="none">{LEVEL_LABEL.none}</option>
                      <option value="read" disabled={!canAdd(perm(key, "read"))}>{LEVEL_LABEL.read}</option>
                      {hasEdit && <option value="edit" disabled={!permissionsForLevel(key, "edit").every(canAdd)}>{LEVEL_LABEL.edit}</option>}
                    </select>
                  </div>
                  {extraActions.length > 0 && level !== "none" && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-medium text-hhc-orange-dark"
                        aria-expanded={expanded}
                        onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                      >
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Aanvullende bevoegdheden{extras.length > 0 ? ` (${extras.length} aan)` : ""}
                      </button>
                      {expanded && (
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {extraActions.map((a: Action) => {
                            const p = perm(key, a);
                            const id = `perm-${p}`;
                            return (
                              <label key={p} htmlFor={id} className="flex items-start gap-2 text-sm">
                                <input
                                  id={id}
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 rounded border-border accent-hhc-orange"
                                  checked={value.has(p)}
                                  disabled={disabled || !canAdd(p)}
                                  onChange={() => toggle(p)}
                                />
                                <span>
                                  {ACTIONS[a].label}
                                  <span className="block text-xs text-muted-foreground">{ACTIONS[a].hint}</span>
                                  {sources?.get(p) && <span className="block text-xs text-muted-foreground">{sources.get(p)}</span>}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  return { ok: false, error: typeof data.error === "string" ? data.error : "Opslaan is niet gelukt." };
}

