# HHC Scanner (/scan): werking aan de ingang

De scanner is een web-app voor de telefoon. De server beslist; zonder verbinding controleert de telefoon met een eigen lijst en meldt alles later terug.

## Uitslagen

| Scherm | Betekenis | Wat doet de steward |
|---|---|---|
| Groen, vinkje, **GELDIG** | Naar binnen. Verdwijnt na 1,6 seconde (of tik). | Doorlaten. |
| Groen, **OPNIEUW BINNEN** | Seizoenskaart die eerder binnen was, bij een wedstrijd met herintrede. Toont wanneer en waar. | Doorlaten. |
| Oranje, uitroepteken, **AL GEBRUIKT** | Ticket is al gescand. Toont wanneer en bij welke ingang. | Stoppen, navragen; alleen een supervisor kan met reden toelaten. |
| Rood, kruis, **NIET GELDIG** | Met reden in gewone taal, en waar mogelijk de oplossing: voor welk vak of welke wedstrijd het ticket wel is. | Niet doorlaten. |
| Grijs, **NIET GECONTROLEERD** | Er ging iets mis (geen verbinding en geen offline-lijst, geen recht). | Melding lezen, opnieuw proberen. |

Elke uitslag heeft een eigen geluid en trilpatroon (iPhone trilt niet vanuit een webpagina). Kleur is nooit het enige signaal: er is ook altijd een icoon en een woord.

## Redenen

`NOT_FOUND` bestaat niet · `OUTDATED` oude versie (na opnieuw versturen of overdragen) · `CANCELLED` geannuleerd · `BLOCKED` geblokkeerd · `EXPIRED` verlopen · `NOT_YET_VALID` · `WRONG_EVENT` (met de juiste wedstrijd erbij) · `WRONG_ZONE` (met het juiste vak erbij) · `EVENT_NOT_ACTIVE` afgelast · `ALREADY_USED` · `PROVIDER_DOWN` Fullhouse niet bereikbaar (supervisor mag met reden toelaten).

Niet te overrulen: bestaat niet, geannuleerd, afgelast, oude versie.

## Handmatig

- **Ticketnummer typen** (XXXX-XXXX-XXXX-XXXX): alleen supervisors. Komt in de scan als "Ingevoerd op ticketnummer". Een nummer staat leesbaar op het ticket en controleert de QR-versie niet; daarom niet voor gewone scanners.
- **Ongedaan maken** (lijst "Laatste scans"): een geldige scan terugdraaien met reden, bijvoorbeeld als iemand toch niet naar binnen ging. Gewone scanner: eigen scan, binnen 10 minuten. Supervisor: elke scan. Uitslag wordt `VOIDED`, het ticket telt weer als ongebruikt, en het staat in het auditlog (`scan.void`) en de scanhistorie.

## Zonder verbinding

- De offline-lijst wordt automatisch geladen bij het kiezen van de wedstrijd en elke 10 minuten ververst (nieuwe tickets en scans van andere scanners).
- De telefoon onthoudt elk ticket dat hij heeft toegelaten, ook online en ook na terugmelden. Een tweede scan zonder verbinding geeft dus "al gebruikt".
- Scans zonder verbinding worden per 25 teruggemeld. Keurt de server een offline toegelaten ticket achteraf af (bijvoorbeeld: al binnen via een andere ingang), dan staat dat rood in "Laatste scans".
- Grens: twee telefoons die allebei geen verbinding hebben, weten niet van elkaars scans tot ze weer online zijn.

## Overig

Scherm blijft aan tijdens het scannen (waar de browser dat toestaat), lamp-knop als de camera die heeft, camera start opnieuw na terugkomen in de app, dezelfde code wordt 6 seconden genegeerd zolang hij voor de camera blijft (geen "al gebruikt" voor iemand die net "geldig" kreeg).

## Testcodes (ook in productie)

`FH-TEST-0001` geeft altijd groen en `FH-TEST-DOWN` toont "Fullhouse niet bereikbaar". Een supervisor kan bij die laatste ook "toch toelaten" oefenen. Het werkt bij elke gekozen wedstrijd, ook zonder verbinding, en alleen voor iemand die in de scanner is ingelogd. Er wordt geen scan opgeslagen en niets telt mee in aantallen, rapporten of de wedstrijddag; er komt alleen een regel `scan.test` in het auditlog. Het scherm toont "Test · niemand binnengelaten". Afbeeldingen om te scannen staan in de projectbestanden onder `hhc-tickets/testcodes/`. In ontwikkeling en previews doet `FH-TEST-UNREACHABLE` (testdata) alsof Fullhouse echt onbereikbaar is.
