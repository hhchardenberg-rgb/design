// De eerste bruikbare ontwerpen: een verzorgde basiscollectie in HHC-huisstijl
// (officieel oranje #FF6F00 en zwart, FF DIN voor koppen, het officiële logo uit de Hub).
// Ze worden één keer aangemaakt als gewone ontwerpsets en zijn daarna volledig bewerkbaar.
// Er staan geen echte wedstrijden, sponsordeals of toegangsrechten in.

import type { OverrideMap } from "./resolve";
import type { TicketKind } from "./fields";

export interface BuiltinSet {
  key: string;
  name: string;
  description: string;
  kind: TicketKind;
  overrides: OverrideMap;
}

const v = (x: unknown) => ({ m: "value" as const, v: x });

export const BUILTIN_SETS: BuiltinSet[] = [
  {
    key: "hhc-wedstrijd",
    name: "HHC wedstrijdticket",
    description: "Standaard wedstrijdticket: zwarte kop, oranje accenten, grote QR-code en de wedstrijd direct in beeld.",
    kind: "match",
    overrides: {
      shared: {
        "color.primary": v("#000000"),
        "color.accent": v("#FF6F00"),
        "type.explanation": { m: "empty" },
      },
    },
  },
  {
    key: "hhc-hospitality",
    name: "HHC hospitality en sponsor",
    description: "Voor VIP-, sponsor- en relatiekaarten: rustig en verzorgd, met bedrijfsnaam en een welkomsttekst.",
    kind: "hospitality",
    overrides: {
      shared: {
        "color.primary": v("#141414"),
        "color.accent": v("#FF6F00"),
        "color.background": v("#FFFFFF"),
        "font.headingWeight": v("bold"),
        "holder.label": v("Gast"),
        "holder.showCompany": v(true),
        "type.explanation": v("Persoonlijke uitnodiging. Toon dit ticket bij de ingang."),
        "extra.title": v("Welkom"),
        "extra.text": v("Fijn dat je onze gast bent. Heb je vragen over je bezoek? Neem dan contact op met je vaste contactpersoon bij HHC Hardenberg."),
        "sponsors.title": v("Partners van HHC Hardenberg"),
        "layout.spacing": v("ruim"),
      },
      a4: { "a4.background": v("tint") },
    },
  },
  {
    key: "hhc-seizoenskaart",
    name: "HHC seizoenskaart",
    description: "Seizoenskaart met een oranje seizoensidentiteit, de houder en een duidelijke omschrijving van de geldigheid.",
    kind: "season",
    overrides: {
      shared: {
        "color.primary": v("#FF6F00"),
        "color.onPrimary": v("#000000"),
        "color.accent": v("#000000"),
        "color.onAccent": v("#FFFFFF"),
        "holder.label": v("Houder"),
        "qr.caption": v("Toon deze kaart bij iedere geldige wedstrijd"),
        "info.entry": v("Toon je kaart bij de ingang. De scanner controleert bij iedere wedstrijd of de kaart geldig is."),
      },
    },
  },
];

export const builtinKeyFor = (kind: TicketKind) => BUILTIN_SETS.find((s) => s.kind === kind)!.key;
