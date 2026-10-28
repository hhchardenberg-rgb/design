"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeRole, type SectionLevel } from "@/lib/access/model";

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
  userCount: number;
  manageable: boolean;
  manageReason: string | null;
}

export const summaryOf = (r: RoleView) => describeRole(r);

const GROUP_ORDER = ["Algemeen", "Communicatie", "Ticketing", "Commerciële Zaken", "Gecombineerd", "Overig"] as const;

/** Onder welk kopje een rol hoort: het onderdeel waar hij toegang toe geeft. */
export function roleGroup(r: RoleView): (typeof GROUP_ORDER)[number] {
  if (r.isAdmin) return "Algemeen";
  const parts = [r.hubLevel !== "NONE" && "Communicatie", r.ticketingLevel !== "NONE" && "Ticketing", r.commercial !== null && "Commerciële Zaken"].filter(Boolean) as ("Communicatie" | "Ticketing" | "Commerciële Zaken")[];
  if (parts.length === 0) return "Overig";
  return parts.length === 1 ? parts[0] : "Gecombineerd";
}

/** Rollen per kopje, in vaste volgorde. */
export function groupRoles(roles: RoleView[]): { label: string; roles: RoleView[] }[] {
  return GROUP_ORDER.map((label) => ({ label, roles: roles.filter((r) => roleGroup(r) === label) })).filter((g) => g.roles.length > 0);
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

/** Kies rollen met een vinkje; per rol staat erbij wat hij geeft. Rollen buiten je eigen beheer zijn niet aan te passen. */
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
  return (
    <div className="space-y-3">
      {groupRoles(roles).map((g) => (
        <div key={g.label}>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.roles.map((r) => {
              const id = `${idPrefix}-${r.id}`;
              const checked = value.includes(r.id);
              return (
                <li key={r.id}>
                  <label
                    htmlFor={id}
                    title={r.manageable ? undefined : r.manageReason ?? undefined}
                    className={cn(
                      "flex h-full items-start gap-2 rounded-md border p-2.5 text-sm",
                      checked ? "border-hhc-orange bg-primary/5" : "border-border",
                      r.manageable ? "cursor-pointer" : "cursor-not-allowed opacity-70",
                    )}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-hhc-orange"
                      checked={checked}
                      disabled={!r.manageable}
                      onChange={() => onChange(checked ? value.filter((x) => x !== r.id) : [...value, r.id])}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {r.name}
                        {!r.manageable && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Niet door jou te wijzigen" />}
                      </span>
                      <span className="block text-xs text-muted-foreground">{summaryOf(r).join(" · ")}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
