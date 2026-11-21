import { formatDayTime } from "@/lib/date-format";
import { RefreshAfterSync } from "./refresh-after-sync";

// Status van de Fullhouse-synchronisatie, voor het dashboard en de Fullhouse-pagina. Puur weergave.

export interface SyncHealthView {
  state: "test" | "ok" | "warning" | "late" | "failing";
  message: string;
  lastOkAt: string | Date | null;
  lastError: string | null;
  lastWebhookAt: string | Date | null;
  frequent: boolean;
  checkedAt: string | Date;
}

const DOT: Record<SyncHealthView["state"], string> = {
  test: "bg-muted-foreground",
  ok: "bg-success",
  warning: "bg-warning",
  late: "bg-warning",
  failing: "bg-destructive",
};

/** "zojuist", "12 min geleden", "3 uur geleden", anders de datum. */
export function sinceText(value: string | Date | null, now: number): string {
  if (!value) return "nog nooit";
  const t = new Date(value).getTime();
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  if (min < 24 * 60) return `${Math.round(min / 60)} uur geleden`;
  return formatDayTime(value);
}

/**
 * `refreshing`: bij het openen van de pagina is net op de achtergrond een ronde gestart. Bij een probleem toont de
 * status dat en laadt hij zichzelf na een halve minuut opnieuw, zodat de gebruiker de verse stand ziet.
 */
export function SyncStatus({ health, compact = false, quietWhenOk = false, refreshing = false }: { health: SyncHealthView; compact?: boolean; quietWhenOk?: boolean; refreshing?: boolean }) {
  const now = new Date(health.checkedAt).getTime();
  const problem = health.state === "failing" || health.state === "late" || health.state === "warning";
  const when = `${sinceText(health.lastOkAt, now)}${health.lastOkAt && new Date(health.lastOkAt).getTime() > now - 86_400_000 ? ` (${formatDayTime(health.lastOkAt)})` : ""}`;
  // Dashboard: als alles goed gaat alleen het tijdstip, zonder uitleg.
  if (quietWhenOk && health.state === "ok") {
    return (
      <div role="status" className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT.ok}`} />
        <span>Fullhouse laatst gesynchroniseerd: {when}</span>
      </div>
    );
  }
  return (
    <div role={problem ? "alert" : "status"} className={`flex items-start gap-2.5 text-sm ${compact ? "" : "rounded-lg border p-3"} ${!compact && health.state === "failing" ? "border-destructive/40 bg-destructive/5" : !compact && problem ? "border-warning/40 bg-warning/5" : !compact ? "border-border" : ""}`}>
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[health.state]}`} />
      <div className="min-w-0">
        <p className={problem ? "font-medium" : ""}>{health.message}</p>
        {health.state !== "test" && (
          <p className="text-xs text-muted-foreground">
            Laatst gelukt: {when}
            {!compact && ` · Laatste webhook: ${sinceText(health.lastWebhookAt, now)}`}
            {health.lastError && ` · Fout: ${health.lastError}`}
          </p>
        )}
        {refreshing && problem && health.state !== "test" && (
          <>
            <p className="text-xs text-muted-foreground">Wordt nu bijgewerkt; deze melding ververst zichzelf over een halve minuut.</p>
            <RefreshAfterSync />
          </>
        )}
      </div>
    </div>
  );
}
