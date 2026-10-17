import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "PSD-naamgevingsconventie" };

const conventions = [
  {
    prefix: "TEXT:",
    example: "TEXT:PLAYER_NAME",
    title: "Dynamisch tekstveld",
    description:
      "Alles wat de gebruiker als tekst moet kunnen invullen: naam, datum, tijd, competitie, uitslag, etc. De importer maakt hier automatisch een tekstveld van, met de fontgrootte, kleur, uitlijning en het kader van de originele laag als uitgangspunt.",
    formLabel: "Naam speler",
  },
  {
    prefix: "IMAGE:",
    example: "IMAGE:PLAYER",
    title: "Dynamisch afbeeldingsveld",
    description:
      "Een foto of logo die de gebruiker zelf uploadt (of kiest uit de spelers-/tegenstanderbibliotheek). De laag bepaalt het kader (positie, afmeting, vorm); de gebruiker kan de eigen foto binnen dat kader verschuiven en uitzoomen.",
    formLabel: "Foto speler",
  },
  {
    prefix: "COLOR:",
    example: "COLOR:ACCENT",
    title: "Huisstijlkleur-veld",
    description:
      "Een vlak of vorm waarvan de kleur door de gebruiker gekozen mag worden — maar uitsluitend uit de door de beheerder vastgelegde huisstijlkleuren, nooit een vrije kleurkiezer.",
    formLabel: "Accentkleur",
  },
  {
    prefix: "VISIBILITY:",
    example: "VISIBILITY:HOME",
    title: "Zichtbaarheidsgroep",
    description:
      "Een lagengroep die als geheel aan- of uitgezet kan worden, bijvoorbeeld om een thuis- of uitversie van hetzelfde ontwerp te tonen. De importer maakt hiervan een aan/uit-veld (checkbox); alle lagen in de groep worden samen gerasterd tot één overlay die met het veld mee schakelt.",
    formLabel: "Toon: Home",
  },
  {
    prefix: "STATIC:",
    example: "STATIC:FRAME",
    title: "Vaste (niet-bewerkbare) laag",
    description:
      "Optioneel, puur ter documentatie voor andere designers: deze laag hoeft nooit aangepast te worden. Lagen zonder herkende prefix worden sowieso als vast onderdeel behandeld — STATIC: maakt dat expliciet en overzichtelijk in het PSD-bestand.",
    formLabel: "(verschijnt niet in het formulier)",
  },
];

export default function PsdConventionsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">PSD-naamgevingsconventie voor designers</h1>
        <p className="mt-2 text-muted-foreground">
          Om een PSD-ontwerp automatisch om te zetten in een bruikbare template, moet de importer weten welke lagen
          door de eindgebruiker ingevuld mogen worden en welke vast onderdeel zijn van het ontwerp. Dat wordt bepaald
          door hoe je de laag in Photoshop een naam geeft — niet door aparte configuratie achteraf.
        </p>
      </div>

      <Card className="bg-surface-muted">
        <CardContent className="p-6">
          <p className="text-sm">
            <strong>Kort gezegd:</strong> geef elke laag die de gebruiker moet kunnen aanpassen een naam die begint
            met één van onderstaande prefixen, gevolgd door een beschrijvende naam in hoofdletters, bijvoorbeeld{" "}
            <code className="rounded bg-surface px-1.5 py-0.5">TEXT:OPPONENT</code>. Alle andere lagen (dus zonder
            prefix, of met <code className="rounded bg-surface px-1.5 py-0.5">STATIC:</code>) worden automatisch plat
            gerasterd tot de achtergrond van de template, precies zoals ze er in Photoshop uitzien.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {conventions.map((c) => (
          <Card key={c.prefix}>
            <CardContent className="flex flex-col gap-2 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-hhc-black px-2 py-1 text-sm font-semibold text-hhc-white">{c.example}</code>
                <span className="text-sm font-semibold">{c.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{c.description}</p>
              <div className="mt-2 flex items-center gap-3 rounded-md border border-dashed border-border p-3 text-sm">
                <span className="text-xs uppercase text-muted-foreground">Wordt automatisch:</span>
                <span className="font-medium">{c.formLabel}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <h2 className="font-semibold">Praktische tips</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              Gebruik <strong>hoofdletters met underscores</strong> na de prefix (bijv.{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5">TEXT:SCORE_HOME</code>) — dit wordt automatisch de
              technische veldnaam. De weergavenaam (het label dat de gebruiker ziet) wordt hiervan afgeleid en kan
              door de beheerder achteraf nog aangepast worden.
            </li>
            <li>
              Zorg dat een <code className="rounded bg-surface-muted px-1 py-0.5">TEXT:</code>-laag qua kader
              (breedte/hoogte) ruimte laat voor kortere én langere invoer. De applicatie verkleint de tekst
              automatisch als het niet past, tot een minimum, en breekt eventueel naar een tweede regel — maar een
              te krap kader geeft nooit een mooi resultaat.
            </li>
            <li>
              Voor <code className="rounded bg-surface-muted px-1 py-0.5">IMAGE:</code>-lagen bepaalt de vorm van de
              laag (rechthoek of cirkel/ellipsmasker) hoe de foto wordt bijgesneden. Werk bij voorkeur met een
              rechthoekig kader; ronde kaders kun je na import in de template-builder alsnog instellen. Een lege
              fotolaag (zonder pixels) beslaat de hele afbeelding.
            </li>
            <li>
              Alles zonder herkende prefix — logo&apos;s, decoratie, achtergrondfoto&apos;s, kaders — wordt automatisch
              meegenomen als vaste laag. <strong>De lagenvolgorde blijft behouden</strong>: vaste lagen boven een{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5">IMAGE:</code>-laag liggen in de template ook boven
              de foto (bijvoorbeeld een rand of verloop over een spelersfoto).
            </li>
            <li>
              Invulbare lagen (<code className="rounded bg-surface-muted px-1 py-0.5">TEXT:</code>,{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5">IMAGE:</code>,{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5">COLOR:</code>) mogen in Photoshop verborgen zijn;
              ze worden toch als veld geïmporteerd. Een zichtbare fotolaag wordt het voorbeeldbeeld dat getoond wordt zolang er niets is gekozen; een verborgen fotolaag laat het veld leeg. Zijn alle invulbare lagen verborgen en staan er geen vaste lagen
              boven, dan wordt de samengestelde afbeelding uit Photoshop als achtergrond gebruikt, inclusief
              laageffecten.
            </li>
            <li>
              Sla op met <strong>Compatibiliteit maximaliseren</strong> aan. Dan kan de import zijn eigen samenstelling
              vergelijken met Photoshop; de builder toont onder &ldquo;Importcontrole&rdquo; de afwijking en een
              verschilbeeld. Wijkt meer dan 15% af, dan kan de versie niet geactiveerd worden.
            </li>
            <li>
              Ondersteund bij vaste lagen: dekking en vuldekking, laagmaskers, uitknipmaskers, groepen (ook met eigen
              dekking of masker), de overvloeimodi van Photoshop en slagschaduw. Niet nagebootst: andere laageffecten
              (gloed, omlijning, bedekkingen) op vaste lagen boven een invulbare laag, en aanpassingslagen. Wil je die toch, voeg de laag
              dan samen of maak er een slim object van.
            </li>
            <li>
              Een ronde foto: knip de <code className="rounded bg-surface-muted px-1 py-0.5">IMAGE:</code>-laag uit op
              een cirkelvorm (uitknipmasker). De import herkent een rond kader; andere vormen worden rechthoekig.
            </li>
            <li>
              Grenzen: RGB, maximaal 8000 pixels per zijde en 1500 lagen.
            </li>
            <li>
              <strong>Lettertypen</strong>: de importer leest per tekstlaag de PostScript-naam van het font (bijv.{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5">DIN-Black</code>) en zoekt het geüploade bestand
              met diezelfde naam. Upload elk gebruikt gewicht als eigen bestand bij Lettertypen. Gebruik echte
              vette/cursieve fonts, geen &ldquo;faux bold&rdquo; of &ldquo;faux italic&rdquo;; die worden niet
              nagebootst. Eén opmaak per tekstlaag: verschillende fonts, groottes of kleuren in één laag worden
              teruggebracht tot de opmaak van het eerste teken.
            </li>
            <li>
              Vrij transformeren en draaien van tekst mag: grootte en rotatie worden overgenomen. Werk bij voorkeur
              met alineatekst (een getekend tekstkader), dan is het kader exact. Ondersteunde tekstopmaak: All Caps,
              letterafstand (tracking), regelafstand, uitlijning, en de laageffecten omlijning, kleurbedekking en
              slagschaduw. Warp, tekst op een pad, verticale tekst en kleinkapitalen worden niet nagebootst; de import
              meldt dat.
            </li>
            <li>
              Lever het bestand aan als platte <code className="rounded bg-surface-muted px-1 py-0.5">.psd</code>{" "}
              (geen Smart Objects met externe links, geen ontbrekende fonts). Niet-ondersteunde Photoshop-functies
              (geavanceerde laagstijlen, blendmodes) worden gerasterd — het eindresultaat blijft er zo dicht mogelijk
              bij, maar blijft geen live effect.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
