// Voorbeeldtickets voor de editor en de controles vóór publicatie. Altijd gemarkeerd als
// voorbeeld, met een testcode die bij de scanner geen toegang geeft. Puur.

import type { TicketKind } from "./fields";
import { SAMPLE_CODE, SAMPLE_PRESETS, type SamplePreset, type TicketFacts } from "./view";

export interface SampleEvent {
  title: string;
  opponent: string | null;
  isHome: boolean;
  competition: string | null;
  startsAt: string;
  location: string | null;
  status: string;
  opponentLogoUrl: string | null;
}

export function sampleFacts(opts: { kind: TicketKind; preset: SamplePreset; event?: SampleEvent | null; typeName?: string | null; typeColor?: string | null; seasonName?: string | null }): TicketFacts {
  const p = SAMPLE_PRESETS[opts.preset];
  const season = opts.seasonName ?? "voorbeeldseizoen";
  // Zonder echte wedstrijd: een duidelijk fictieve voorbeeldwedstrijd (nooit een echte planning).
  const event: SampleEvent | null =
    opts.kind === "season"
      ? null
      : opts.event ?? { title: `HHC Hardenberg – ${p.opponent ?? "tegenstander"}`, opponent: p.opponent, isHome: true, competition: p.competition, startsAt: "2000-01-01T13:30:00Z", location: null, status: "ACTIVE", opponentLogoUrl: null };
  return {
    sample: true,
    kind: opts.kind,
    firstName: p.firstName,
    lastName: p.lastName,
    company: p.company,
    typeName: opts.typeName ?? (opts.kind === "season" ? "Seizoenskaart" : opts.kind === "hospitality" ? "Hospitality" : "Wedstrijdticket"),
    typeColor: opts.typeColor ?? null,
    ticketNumber: "VOOR-BEEL-D000-0000",
    qrCode: SAMPLE_CODE,
    seasonName: season,
    validityText: opts.kind === "season" ? `Geldig voor alle thuiswedstrijden van HHC Hardenberg in seizoen ${season}` : event ? `Geldig voor ${event.title}` : "Voorbeeld",
    event: event ? { ...event, opponent: opts.preset === "ontbrekend" ? null : event.opponent, competition: opts.preset === "ontbrekend" ? null : event.competition } : null,
    events: [],
    zoneName: p.zone,
    entranceName: p.entrance,
    notices: [],
    statusLabel: "Voorbeeld",
    usable: true,
  };
}
