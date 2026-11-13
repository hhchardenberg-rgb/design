"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EVENT_STATUS_LABELS, TICKET_STATUS_LABELS, type EventStatus, type TicketStatus } from "@/lib/tickets/rules";

/** JSON ophalen of versturen; gooit een Error met de Nederlandse foutmelding van de API. */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Er is iets misgegaan.");
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Er is iets misgegaan.");

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success",
  BLOCKED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-surface-muted text-muted-foreground line-through",
  EXPIRED: "bg-surface-muted text-muted-foreground",
};

export function TicketStatusBadge({ status }: { status: TicketStatus | "EXPIRED" }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[status])}>{TICKET_STATUS_LABELS[status]}</span>;
}

export function EventStatusBadge({ status }: { status: string }) {
  const s = status as EventStatus;
  return <Badge variant={s === "ACTIVE" ? "success" : s === "DRAFT" ? "outline" : "default"}>{EVENT_STATUS_LABELS[s] ?? status}</Badge>;
}

export function PageTitle({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** datetime-local-waarde (Nederlandse tijd) ↔ ISO. */
export function toLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Een datetime-local (Nederlandse tijd) als ISO-tijdstip, rekening houdend met zomer-/wintertijd. */
export function fromLocalInput(local: string): string {
  if (!local) return "";
  const guess = new Date(`${local}:00Z`);
  // Verschil tussen UTC en Amsterdam op dat moment.
  const asAms = new Date(toLocalInput(guess) + ":00Z");
  const offset = asAms.getTime() - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export const isoDay = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");
