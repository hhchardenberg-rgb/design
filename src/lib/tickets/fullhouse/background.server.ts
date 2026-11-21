import { after } from "next/server";
import { runAutoSync } from "./auto-sync.server";

export const BACKGROUND_INTERVAL_MS = 3 * 60_000;

/**
 * Na het antwoord (de gebruiker wacht er niet op) een automatische ronde starten als de vorige
 * minstens 3 minuten geleden was. Zo blijft de kopie ook vers als de geplande taak even niet draait,
 * bijvoorbeeld op een wedstrijddag met Wedstrijddag live open.
 */
export function syncFullhouseInBackground() {
  after(async () => {
    try {
      await runAutoSync({ trigger: "page", minIntervalMs: BACKGROUND_INTERVAL_MS });
    } catch (e) {
      console.error("[fullhouse] achtergrondsynchronisatie mislukt", e instanceof Error ? e.message : e);
    }
  });
}
