/**
 * Bewaartermijn van databaseback-ups ("grootvader-vader-zoon"):
 *  - alles van de afgelopen DAILY_DAYS dagen;
 *  - daarnaast de laatste back-up van elke week, WEEKLY_WEEKS weken terug;
 *  - daarnaast de laatste back-up van elke maand, MONTHLY_MONTHS maanden terug.
 * De nieuwste geslaagde back-up blijft altijd bewaard, hoe oud ook, zodat er nooit
 * "niets" overblijft als de back-ups een tijd hebben stilgelegen.
 */
export const RETENTION = { DAILY_DAYS: 14, WEEKLY_WEEKS: 8, MONTHLY_MONTHS: 12 } as const;

export interface RetentionItem {
  id: string;
  createdAt: Date;
}

const DAY = 24 * 60 * 60 * 1000;

/** Maandag van de week (UTC) als sleutel, bv. "2026-11-02". */
function weekKey(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Geeft de id's terug die volgens de bewaartermijn weg mogen. */
export function selectExpired(items: RetentionItem[], now: Date, policy = RETENTION): string[] {
  const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const keep = new Set<string>();
  if (sorted[0]) keep.add(sorted[0].id);

  const weeks = new Set<string>();
  const months = new Set<string>();
  const t = now.getTime();
  for (const item of sorted) {
    const age = t - item.createdAt.getTime();
    if (age <= policy.DAILY_DAYS * DAY) keep.add(item.id);
    const w = weekKey(item.createdAt);
    if (!weeks.has(w)) {
      weeks.add(w);
      if (age <= policy.WEEKLY_WEEKS * 7 * DAY) keep.add(item.id);
    }
    const m = monthKey(item.createdAt);
    if (!months.has(m)) {
      months.add(m);
      if (age <= policy.MONTHLY_MONTHS * 31 * DAY) keep.add(item.id);
    }
  }
  return sorted.filter((i) => !keep.has(i.id)).map((i) => i.id);
}
