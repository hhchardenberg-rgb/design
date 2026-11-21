"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeRole, type SectionLevel } from "@/lib/access/model";
import { SECTIONS, matchesStandard, standardRole, type Section, type StandardRole } from "@/lib/access/presets";

/** Een rol zoals de beheerschermen hem krijgen (zie listRoles in src/lib/access/service.server.ts). */
export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isAdmin: boolean;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  commercial: string[] | null;
  /** null/ontbreekt = geen toegang tot HHC Tickets. */
  tickets?: string[] | null;
  /** Standaardrol (src/lib/access/presets.ts), of null. */
  presetKey?: string | null;
  userCount: number;
  manageable: boolean;
  manageReason: string | null;
}

export const summaryOf = (r: RoleView) => describeRole(r);

export type RoleGroup = "Algemeen" | Section | "Eigen rollen";
const GROUP_ORDER: RoleGroup[] = ["Algemeen", ...SECTIONS, "Eigen rollen"];

/** De standaardrol achter deze rol, of undefined voor een eigen rol. */
export function standardOf(r: Pick<RoleView, "presetKey" | "isAdmin">): StandardRole | undefined {
  return r.isAdmin ? undefined : standardRole(r.presetKey);
}

/** Wijkt deze standaardrol af van wat de standaard zegt? */
export function isCustomized(r: RoleView): boolean {
  const s = standardOf(r);
  return !!s && !matchesStandard(s, { hubLevel: r.hubLevel, ticketingLevel: r.ticketingLevel, commercial: r.commercial, tickets: r.tickets ?? null });
}

/** Onder welk kopje een rol hoort: het onderdeel van de standaardrol, anders Eigen rollen. */
export function roleGroup(r: RoleView): RoleGroup {
  if (r.isAdmin) return "Algemeen";
  return standardOf(r)?.section ?? "Eigen rollen";
}

const rankOf = (r: RoleView) => standardOf(r)?.rank ?? 0;

/** Rollen per kopje, in vaste volgorde (niveaus van laag naar hoog, dan taken). */
export function groupRoles(roles: RoleView[]): { label: RoleGroup; roles: RoleView[] }[] {
  return GROUP_ORDER.map((label) => ({
    label,
    roles: roles.filter((r) => roleGroup(r) === label).sort((a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name, "nl")),
  })).filter((g) => g.roles.length > 0);
}

/** Korte naam: binnen een onderdeel volstaat "Medewerker". */
export function shortName(r: RoleView): string {
  return standardOf(r)?.short ?? r.name;
}

/** Tabs bovenaan: gebruikers en rollen horen bij elkaar. */
export function AccessTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/admin/users", label: "Gebruikers" },
    { href: "/admin/users/rollen", label: "Rollen" },
  ];
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Gebruikers en rechten">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-hhc-orange text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RoleBadge({ role }: { role: RoleView }) {
  return (
    <Badge variant={role.isAdmin ? "primary" : "default"} title={summaryOf(role).join(" · ")}>
      {role.name}
    </Badge>
  );
}

/** Wat iemand heeft, per onderdeel in één regel: "Communicatie: Beheerder", "HHC Tickets: Scanner". */
export function AccessSummary({ assigned }: { assigned: RoleView[] }) {
  if (assigned.length === 0) return <Badge variant="outline">Geen rollen: nergens toegang</Badge>;
  return (
    <>
      {groupRoles(assigned).map((g) =>
        g.label === "Algemeen" || g.label === "Eigen rollen" ? (
          g.roles.map((r) => <RoleBadge key={r.id} role={r} />)
        ) : (
          <Badge key={g.label} variant="default" title={g.roles.map((r) => summaryOf(r).join(" · ")).join("\n")}>
            <span className="font-semibold">{g.label}:</span>&nbsp;{g.roles.map(shortName).join(" + ")}
          </Badge>
        ),
      )}
    </>
  );
}

function Segment({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-hhc-orange bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Rollen kiezen: per onderdeel één niveau (Geen, Medewerker, Beheerder, …) en losse taken
 * erbij. Hoofdadmin en eigen rollen met een vinkje. Rollen buiten je eigen beheer zijn niet aan te passen.
 */
export function RolePicker({
  roles,
  value,
  onChange,
  idPrefix,
}: {
  roles: RoleView[];
  value: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
}) {
  const has = (id: string) => value.includes(id);
  const toggle = (r: RoleView) => onChange(has(r.id) ? value.filter((x) => x !== r.id) : [...value, r.id]);

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {groupRoles(roles).map((g) => {
        if (g.label === "Algemeen" || g.label === "Eigen rollen") {
          return (
            <div key={g.label} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
              <span className="w-40 shrink-0 text-sm font-semibold">{g.label}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {g.roles.map((r) => (
                  <label key={r.id} htmlFor={`${idPrefix}-${r.id}`} title={r.manageable ? summaryOf(r).join(" · ") : r.manageReason ?? undefined} className={cn("flex items-center gap-1.5 text-sm", r.manageable ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                    <input id={`${idPrefix}-${r.id}`} type="checkbox" className="h-4 w-4 rounded border-border accent-hhc-orange" checked={has(r.id)} disabled={!r.manageable} onChange={() => toggle(r)} />
                    {r.name}
                    {!r.manageable && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Niet door jou te wijzigen" />}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        const levels = g.roles.filter((r) => standardOf(r)?.kind === "niveau");
        const tasks = g.roles.filter((r) => standardOf(r)?.kind === "taak");
        const held = levels.filter((r) => has(r.id));
        const current = held.sort((a, b) => rankOf(b) - rankOf(a))[0];
        const lockedCurrent = held.some((r) => !r.manageable);
        const pick = (r: RoleView | null) => onChange([...value.filter((id) => !levels.some((l) => l.id === id)), ...(r ? [r.id] : [])]);
        return (
          <div key={g.label} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
            <span className="w-40 shrink-0 pt-1 text-sm font-semibold">{g.label}</span>
            <div className="flex min-w-0 flex-col gap-2">
              {levels.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Niveau ${g.label}`}>
                  <Segment active={!current} disabled={lockedCurrent} onClick={() => pick(null)}>
                    Geen
                  </Segment>
                  {levels.map((r) => (
                    <Segment key={r.id} active={current?.id === r.id} disabled={(!r.manageable || lockedCurrent) && current?.id !== r.id} title={r.manageable ? (r.description ?? undefined) : r.manageReason ?? undefined} onClick={() => pick(r)}>
                      {shortName(r)}
                    </Segment>
                  ))}
                </div>
              )}
              {tasks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Taken:</span>
                  {tasks.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={has(r.id)}
                      disabled={!r.manageable}
                      title={r.manageable ? (r.description ?? undefined) : r.manageReason ?? undefined}
                      onClick={() => toggle(r)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
                        has(r.id) ? "border-hhc-orange bg-primary/10 text-hhc-orange-dark" : "border-border text-muted-foreground hover:bg-surface-muted",
                      )}
                    >
                      {has(r.id) ? "✓ " : "+ "}
                      {shortName(r)}
                    </button>
                  ))}
                </div>
              )}
              {current && <p className="text-xs text-muted-foreground">{current.description ?? summaryOf(current).join(" · ")}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
