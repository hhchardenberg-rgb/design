// Rekenregels voor doelen en prognose. Zuiver (geen database) zodat ze los te testen zijn.
// Bewust zonder server-only imports: ook in de browser te gebruiken.

/**
 * Kans (in procenten) waarmee een open kans in de pijplijn wordt meegeteld in de prognose.
 * Dit zijn werkafspraken, geen gemeten cijfers: ze staan zichtbaar op het scherm en zijn hier op één plek aan te passen.
 */
export const STAGE_WEIGHT_PERCENT = { LEAD: 10, CONTACTED: 25, PROPOSAL: 50, NEGOTIATION: 75 } as const;
export type OpenStage = keyof typeof STAGE_WEIGHT_PERCENT;
export const OPEN_STAGES = Object.keys(STAGE_WEIGHT_PERCENT) as OpenStage[];

export const isOpenStage = (s: string): s is OpenStage => s in STAGE_WEIGHT_PERCENT;

/** Gewogen waarde van een kans in eurocenten (afgerond op hele centen). */
export function weightedCents(stage: string, expectedCents: number): number {
  return isOpenStage(stage) ? Math.round((expectedCents * STAGE_WEIGHT_PERCENT[stage]) / 100) : 0;
}

export interface Standing {
  /** Wat er nog moet komen om het doel te halen, op basis van wat al loopt. */
  missingCents: number;
  /** Lopend + gewogen pijplijn. */
  forecastCents: number;
  /** Wat er ook na de prognose nog ontbreekt (0 als de prognose het doel haalt). */
  shortfallCents: number;
  /** Voortgang van wat al loopt, in hele procenten (mag boven 100 uitkomen). */
  progressPercent: number;
}

export function standing(targetCents: number, realisedCents: number, pipelineWeightedCents: number): Standing {
  const forecastCents = realisedCents + pipelineWeightedCents;
  return {
    missingCents: Math.max(0, targetCents - realisedCents),
    forecastCents,
    shortfallCents: Math.max(0, targetCents - forecastCents),
    progressPercent: targetCents > 0 ? Math.round((realisedCents / targetCents) * 100) : 0,
  };
}
