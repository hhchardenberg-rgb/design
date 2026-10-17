import type { ImageFieldValue } from "@/lib/render/imageFit";

/**
 * Vult een nieuw ontwerp vanuit een wedstrijd. Velden worden herkend aan
 * hun sleutel, in het Engels of Nederlands (zoals ze uit een PSD komen:
 * TEXT:tegenstander, IMAGE:logo_tegenstander, VISIBILITY:thuis). Tijden in
 * Europe/Amsterdam.
 */
export interface PrefillMatch {
  isHome: boolean;
  date: Date;
  competition: string | null;
  round?: string | null;
  location: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  team: { id: string; name: string; logoUrl: string | null };
  opponent: { id: string; name: string; logoUrl: string | null };
}

type Binding =
  | "opponent"
  | "opponent_logo"
  | "team"
  | "team_logo"
  | "home_team"
  | "away_team"
  | "home_logo"
  | "away_logo"
  | "competition"
  | "round"
  | "location"
  | "date"
  | "time"
  | "score_home"
  | "score_away"
  | "is_home"
  | "is_away";

const ALIASES: Record<Binding, string[]> = {
  opponent: ["opponent", "tegenstander", "tegenpartij"],
  opponent_logo: ["opponent_logo", "logo_opponent", "logo_tegenstander", "tegenstander_logo"],
  team: ["team", "eigen_team", "hhc_team", "ons_team"],
  team_logo: ["team_logo", "logo_team", "club_logo", "logo_hhc"],
  home_team: ["home_team", "home", "thuisploeg", "thuisteam", "team_thuis"],
  away_team: ["away_team", "away", "uitploeg", "uitteam", "team_uit"],
  home_logo: ["home_logo", "logo_home", "logo_thuis", "thuis_logo", "logo_thuisploeg"],
  away_logo: ["away_logo", "logo_away", "logo_uit", "uit_logo", "logo_uitploeg"],
  competition: ["competition", "competitie", "klasse"],
  round: ["round", "ronde", "speelronde"],
  location: ["location", "locatie", "plaats", "veld"],
  date: ["date", "datum", "wedstrijddatum"],
  time: ["time", "tijd", "aanvang", "aftrap"],
  score_home: ["score_home", "score_thuis", "home_score", "thuis_score", "doelpunten_thuis"],
  score_away: ["score_away", "score_uit", "away_score", "uit_score", "doelpunten_uit"],
  is_home: ["thuis", "home", "thuiswedstrijd", "is_home"],
  is_away: ["uit", "away", "uitwedstrijd", "is_away"],
};

const normalize = (key: string) => key.toLowerCase().replace(/[\s.-]+/g, "_");

function bindingFor(key: string, type: string): Binding | null {
  const k = normalize(key);
  // Een aan/uit-veld "thuis" is de thuis/uit-schakelaar, een tekstveld
  // "home" de naam van de thuisploeg.
  const order: Binding[] =
    type === "CHECKBOX" ? ["is_home", "is_away"] : (Object.keys(ALIASES) as Binding[]).filter((b) => b !== "is_home" && b !== "is_away");
  return order.find((b) => ALIASES[b].includes(k)) ?? null;
}

function logo(kind: "team" | "opponent", side: { id: string; logoUrl: string | null }): ImageFieldValue | undefined {
  return side.logoUrl ? { asset: { kind, id: side.id }, assetUrl: side.logoUrl, panX: 0, panY: 0, scale: 1 } : undefined;
}

export function matchPrefill(fields: { key: string; type: string }[], match: PrefillMatch): Record<string, unknown> {
  const home = match.isHome ? match.team : match.opponent;
  const away = match.isHome ? match.opponent : match.team;
  const logoOf = (side: typeof home) => logo(side === match.team ? "team" : "opponent", side);
  const dateText = (() => {
    const s = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(match.date);
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const binding = bindingFor(field.key, field.type);
    const isImage = field.type === "IMAGE" || field.type === "LOGO";
    let value: unknown;
    switch (binding) {
      case "opponent": value = match.opponent.name; break;
      case "team": value = match.team.name; break;
      case "home_team": value = home.name; break;
      case "away_team": value = away.name; break;
      case "opponent_logo": value = logo("opponent", match.opponent); break;
      case "team_logo": value = logo("team", match.team); break;
      case "home_logo": value = logoOf(home); break;
      case "away_logo": value = logoOf(away); break;
      case "competition": value = match.competition ?? undefined; break;
      case "round": value = match.round ?? undefined; break;
      case "location": value = match.location ?? undefined; break;
      case "date": value = dateText; break;
      case "time":
        value = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(match.date);
        break;
      case "score_home": value = match.scoreHome ?? undefined; break;
      case "score_away": value = match.scoreAway ?? undefined; break;
      case "is_home": value = match.isHome; break;
      case "is_away": value = !match.isHome; break;
    }
    if (value === undefined || value === null) continue;
    // Een logo alleen in een afbeeldingsveld, tekst alleen in een tekstveld.
    if (isImage !== (typeof value === "object")) continue;
    out[field.key] = typeof value === "number" ? String(value) : value;
  }
  return out;
}
