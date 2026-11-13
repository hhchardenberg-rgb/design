"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDayTime } from "@/lib/date-format";

interface AuditRow {
  id: string;
  at: string;
  action: string;
  label: string;
  actorName: string | null;
  targetName: string | null;
  summary: string;
  ip: string | null;
}

const GROUPS = [
  { id: "", label: "Alles" },
  { id: "login", label: "Inloggen" },
  { id: "beveiliging", label: "Beveiliging" },
  { id: "accounts", label: "Accounts en rollen" },
  { id: "gegevens", label: "Back-ups en downloads" },
];

const WARN = new Set(["auth.login_failed", "auth.locked", "auth.new_device", "auth.mfa_disabled", "backup.failed", "user.deleted"]);

async function fetchPage(group: string, q: string, cursor: string | null) {
  const p = new URLSearchParams();
  if (group) p.set("groep", group);
  if (q) p.set("q", q);
  if (cursor) p.set("cursor", cursor);
  const res = await fetch(`/api/admin/audit?${p}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Kon het audit-log niet laden.");
  return body as { events: AuditRow[]; next: string | null };
}

export function AuditLogPanel({ commercialEnabled = false }: { commercialEnabled?: boolean }) {
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((r: { events: AuditRow[]; next: string | null }, append: boolean) => {
    setRows((prev) => (append && prev ? [...prev, ...r.events] : r.events));
    setNext(r.next);
    setError(null);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPage(group, applied, null)
      .then((r) => alive && apply(r, false))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [group, applied, apply]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Audit-log</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Wie deed wat, en wanneer: inloggen, beveiligingsinstellingen, accounts en rollen, back-ups en downloads. Regels worden ruim een jaar bewaard.
          {commercialEnabled && " Wijzigingen binnen Commerciële Zaken staan daarnaast in het eigen logboek van dat onderdeel."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <Button key={g.id} size="sm" variant={group === g.id ? "primary" : "outline"} onClick={() => setGroup(g.id)}>
            {g.label}
          </Button>
        ))}
        <form
          className="ml-auto flex w-full items-center gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(query.trim());
          }}
        >
          <Input placeholder="Zoek op naam of IP-adres" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:w-64" />
          <Button type="submit" size="icon" variant="outline" aria-label="Zoeken">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {!rows ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen regels gevonden.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Moment</th>
                  <th className="py-2 pr-3 font-medium">Gebeurtenis</th>
                  <th className="py-2 pr-3 font-medium">Door</th>
                  <th className="py-2 pr-3 font-medium">Details</th>
                  <th className="py-2 font-medium">IP-adres</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDayTime(r.at)}</td>
                    <td className={`py-2 pr-3 ${WARN.has(r.action) ? "font-medium text-destructive" : ""}`}>{r.label}</td>
                    <td className="py-2 pr-3">{r.actorName ?? "–"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.summary}</td>
                    <td className="py-2 whitespace-nowrap text-muted-foreground">{r.ip ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {next ? (
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={() => fetchPage(group, applied, next).then((r) => apply(r, true)).catch((e: Error) => setError(e.message))}>
                Meer laden
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
