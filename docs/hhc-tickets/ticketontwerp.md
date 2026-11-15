# Ticketontwerp en standaarden

Eén ticket, twee weergaven: de mobiele ticketpagina (`/t/<token>`) en het A4-ticket (pdf). Beide komen
uit hetzelfde vastgelegde ontwerp en gebruiken dezelfde ticketidentiteit, QR-code en toegangsrechten.
Er komen geen nieuwe codes of tokens bij; Fullhouse-codes blijven onaangeroerd.

## Voor beheerders (kort)

**Seizoensstandaard instellen.** Ga naar HHC Tickets → Inrichting → *Ticketontwerp en standaarden*, kies
bovenaan **Seizoen** en het seizoen (of klik bij *Tickettypes, vakken en seizoenen* achter een seizoen op
*Ticketontwerp*). Pas de onderdelen aan; alles wordt automatisch als concept bewaard. Wil je iets alleen voor
één tickettype, kies dan rechts *Alleen <tickettype>*.

**Teksten aanpassen.** *Alle teksten* (standaard open) toont elke tekst van het ticket op één plek; klik in
het voorbeeld op een tekst om er direct naartoe te gaan. Een wijziging geldt voor mobiel en A4 op het niveau dat
je bewerkt. *Meer opties* opent het onderdeel voor afwijkingen per formaat.

**Uitzondering voor één duel.** Klik bij *Wedstrijden* op het palet-icoon achter het duel, of kies bovenaan
**Duel**. Wijzig alleen wat anders moet; de rest blijft de seizoensstandaard volgen. *Bekijk verschillen met
seizoenstandaard* laat zien wat afwijkt; *Gebruik seizoenstandaard* haalt alle afwijkingen weg.

**Publiceren.** Klik *Controleren en publiceren*. Je ziet eerst welke meldingen er zijn (fouten blokkeren),
welke seizoenen, duels en tickettypes het raakt, welke ervan een eigen instelling hebben (die blijven
beschermd) en hoeveel tickets al zijn uitgegeven. Publiceren geldt voor mobiel en A4 tegelijk. Al
uitgegeven tickets behouden hun ontwerp; wil je ze toch bijwerken, gebruik dan *Bestaande tickets opnieuw
vormgeven* (QR-code, link, rechten en scans blijven gelijk).

**Een instelling herstellen.** Per veld: *Herstel* (of keuze *Gebruik bovenliggende instelling*). Per
onderdeel: *Herstel onderdeel* toont eerst wat verdwijnt. Een eerdere gepubliceerde versie: *Versies* →
*Terugzetten als concept*, daarna opnieuw publiceren. *Terug naar gepubliceerde versie* verwerpt het concept.

## Overerving

Volgorde (laag wint van hoog): basisontwerp → ontwerpset → club algemeen → club per tickettype → seizoen
algemeen → seizoen per tickettype → duel algemeen → duel per tickettype. Binnen elk niveau eerst *beide
formaten*, dan *alleen mobiel* / *alleen A4*.

Per veld drie keuzes: overnemen (niets opgeslagen), eigen waarde, of *Niet tonen* / *Bewust leeg*. Een lege
tekst, uit of 0 is een eigen waarde en betekent nooit "overnemen". Alleen bewuste afwijkingen worden
opgeslagen (`tickets_design_scopes.published` / `.draft`).

De ontwerpset wordt per soort ticket gekozen (wedstrijdticket, hospitality, seizoenskaart) en erft zelf ook.
Een seizoenskaart gebruikt nooit duelinstellingen en toont geen wedstrijdgegevens.

## Techniek

- Code: `src/lib/tickets/design/` (pure logica: `fields.ts`, `resolve.ts`, `view.ts`, `validate.ts`,
  `a4-layout.ts`; server: `context.server.ts`, `admin.server.ts`, `pdf.server.ts`, `public.server.ts`).
  Editor: `src/components/tickets/design/`, pagina `/tickets/ontwerp`, API `/api/tickets/design/*`.
- Tabellen (alleen toegevoegd): `tickets_design_sets`, `tickets_design_scopes`, `tickets_design_scope_versions`,
  `tickets_design_assets`, `tickets_design_asset_versions`, `tickets_design_snapshots`; op `tickets_tickets`
  de kolommen `designSnapshotId` en `designAppliedAt`.
- **Vastleggen bij uitgifte**: na de uitgifte wordt het nu geldende ontwerp als snapshot (ontdubbeld op hash)
  aan het ticket gekoppeld. Tickets van vóór deze module krijgen dat bij de eerste weergave.
- **Wedstrijdgegevens** (datum, tijd, tegenstander, status) komen altijd live uit de wedstrijd; bij een
  verplaatst of afgelast duel toont het ticket een melding.
- **Publiceren** is één transactie over alle gekozen niveaus en beide formaten, met revisiecontrole
  (gelijktijdig bewerken geeft een conflictmelding met de naam van de collega) en een versie + auditregel.
- **A4**: één indelingsfunctie berekent de posities; de pdf (pdf-lib) en het editorvoorbeeld (svg) tekenen
  dezelfde indeling. Past het niet op één pagina, dan wordt stapsgewijs compacter gemaakt; lukt dat niet,
  dan blokkeert publiceren. QR als vector met minimaal 4 modules witrand.
- **Afbeeldingen** staan als onveranderlijke versies in de database (vervangen = nieuwe versie; tickets
  houden hun versie) en worden geserveerd via `/api/public/ticket-assets/<versie>`.
- **Rechten**: `design:read`, `design:edit`, `design:publish`, `design:apply` (opnieuw vormgeven), op de server
  afgedwongen. Rollen krijgen ze via Gebruikers en rollen.
- Ticketpagina en pdf: `noindex`, `private, no-store`; bestandsnaam zonder persoonsgegevens.

## Aannames en wat (nog) niet bestaat

- Tribune/rij/stoel bestaan niet in het datamodel; het ticket toont vak en ingang.
- Poorttijd: de wedstrijd heeft geen veld hiervoor; standaard "60 minuten voor aanvang", instelbaar.
- Apple/Google Wallet: geen accounts/certificaten, dus geen knoppen. *Bewaar offline* slaat de pagina in de browser op.
- Voorbeeldtickets gebruiken fictieve gegevens en de code `HHC-VOORBEELD-GEEN-TOEGANG`, die nooit toegang geeft (geen geldige HHC-handtekening; getest). Op het voorbeeldticket zelf staat geen voorbeeldmelding; de editor vermeldt het erbuiten.

## Tests

- Automatisch: `src/lib/tickets/design/__tests__/resolve.test.ts` (overerving, leeg/uit/0, voorrang,
  ontwerpset, ontbrekende gegevens, opschonen) en `design.integration.test.ts` (Postgres: vastleggen bij
  uitgifte, concept raakt niets, atomair publiceren, opnieuw vormgeven behoudt QR/scans, seizoen kopiëren
  zonder tickets, herstellen, rechten, conflicten, seizoenskaart).
- Visueel gecontroleerd: voorbeeld-pdf's (kort, lang, ontbrekend) en de mobiele pagina in de preview.
- Nog in de praktijk te testen: scannen van het A4 en het telefoonscherm met de echte scanner, printen op
  een kantoorprinter (ook zwart-wit) en de pagina op een echte iPhone/Android met grote tekst.

## Lettertypen

Het ticketontwerp gebruikt de huisstijlletters: **FF DIN** voor koppen (Medium 500, Bold 700, Black 900) en **Inter** voor lopende tekst (400, 600, 700, 800). Eén lijst in `src/lib/tickets/design/fonts.ts` bepaalt de bestanden en gewichten voor alle plekken:

- **A4-pdf**: de TTF-versies uit `public/fonts/` worden ingesloten (gesubset), dus de pdf ziet er op elk apparaat hetzelfde uit.
- **Mobiele ticketpagina en editorvoorbeelden**: dezelfde letters via `ticket-fonts.css` (OTF/WOFF2), vooraf geladen; ook de QR-weergave en de knoppen gebruiken ze.
- **Offline bewaren**: de lettertypen worden mee opgeslagen, zodat het ticket zonder internet in de huisstijl blijft.
- **Editor**: de keuze voor lettertype en gewicht toont een voorbeeld in de echte letter.
- **Ticketmail**: Inter waar de mailapp webfonts toont (Apple Mail, iOS), anders Arial. FF DIN wordt bewust niet in mail gebruikt.

`src/lib/tickets/design/__tests__/fonts.test.ts` controleert dat alle bestanden bestaan en dat de pdf FF DIN en Inter insluit.
