# HHC Tickets: setup en gebruik

Zie `architectuur.md` voor het ontwerp van het hele product. Dit bestand beschrijft wat je nodig hebt om HHC Tickets te draaien en hoe je het gebruikt.

## Aanzetten

1. Zet in Vercel de variabele `TICKETS_ENABLED=true` (zonder die variabele bestaat HHC Tickets niet en geven alle pagina's en API's 404).
2. Maak een sleutel voor QR-codes en ticketlinks: `openssl rand -base64 32`, en zet die als `TICKETS_SIGNING_KEY`. Gebruik voor Production en Preview **verschillende** waarden. Zonder sleutel weigert de Hub in Vercel tickets uit te geven.
   - Sleutelrotatie: `nieuw:<base64>,oud:<base64>`. De eerste tekent, de rest blijft alleen geldig voor controle.
   - Verandert of verliest iemand de sleutel zonder rotatie, dan zijn alle uitgegeven QR-codes en links ongeldig. Bewaar de sleutel dus ook in de wachtwoordkluis.
3. De database-tabellen (`tickets_*`) en de nieuwe kolommen op `access_roles` komen mee met `prisma db push` in `vercel-build`. Alles is additief.
4. Geef rollen toegang: Beheer > Gebruikers en rechten > Rollen, blok **HHC Tickets**. Alleen de hoofdadmin kan dat. Kies per rol een voorbeeld (Ticketbeheerder, Ticketuitgever, Scannercoördinator, Scanner, Financieel beheerder, Communicatiebeheerder, Bestuur/directie, Alleen lezen). De Hoofdadmin is de superadmin en mag automatisch alles.
5. Wie meer mag dan scannen, moet tweestapsverificatie instellen (zelfde regel als Commerciële Zaken).

## Omgevingsvariabelen

| Variabele | Fase | Doel |
|---|---|---|
| `TICKETS_ENABLED` | 1 | Featureflag |
| `TICKETS_SIGNING_KEY` | 1 | Handtekening van QR en links |
| `FULLHOUSE_MODE` | 4 | `mock` (standaard), `sandbox` of `production`. Een preview gebruikt nooit `production`. |
| `FULLHOUSE_API_BASE` | 4 | Standaard `https://vivenu.com/api` (sandbox: `https://vivenu.dev/api`) |
| `FULLHOUSE_API_KEY` | 4 | API-sleutel (alleen lezen, Bearer). Heeft voorrang; leest de gewone lijsten `/events` en `/tickets`. Nooit in code of chat |
| `FULLHOUSE_ACCESS_TOKEN` | 4 | Alternatief zonder API-sleutel: token van een access user (scanapparaat) |
| `FULLHOUSE_WEBHOOK_SECRET` | 4 | HMAC-sleutel van de webhook |
| `FULLHOUSE_ALLOW_WRITES` | 4 | Standaard uit. Zet nooit aan zonder overleg (schrijfacties naar Fullhouse zijn nog niet aangesloten). |
| `CRON_SECRET` | 4 | Staat al ingesteld voor de andere crons |
| Apple/Google Wallet | later | Zie `architectuur.md` §11 |

Onder HHC Tickets > Instellingen zie je welke sleutels zijn ingesteld (alleen ja/nee, nooit de waarde).

## Wat fase 1 doet

- Wedstrijden, seizoenen, toegangsvakken en tickettypes beheren (geldig voor één wedstrijd, meerdere wedstrijden, seizoen of periode; vervalt automatisch na de wedstrijd).
- Tickets uitgeven: één per keer, meerdere tegelijk, of via CSV/Excel (sjabloon beschikbaar). Boven de drempel (standaard 50, instelbaar) is goedkeuring door een andere bevoegde collega nodig.
- Ticketoverzicht met zoeken, blokkeren, annuleren, heractiveren, opnieuw uitgeven (nieuwe QR-versie) en anonimiseren. Altijd met reden en in het auditlog.
- Dashboard en auditlog. Scans, Fullhouse-aantallen en live bezoekers staan als "volgt" op het dashboard.
- QR-formaat is klaar: `HHC1.<kenmerk>.<versie>.<handtekening>` (geen persoonsgegevens, HMAC-SHA256). De QR wordt nog nergens getoond; dat gebeurt in fase 2 op de ticketpagina.

## Aflevering (fase 2)

- Op de ticketpagina in de Hub: **Mailen**, **Persoonlijke link kopiëren** en **Delen via WhatsApp**. Alles komt in het verzendlog (geen adres of inhoud).
- De ontvanger opent `/t/<persoonlijke link>`: QR-code, ticketgegevens en PDF-download. De link bevat geen persoonsgegevens, is ondertekend en werkt tot je hem intrekt (Acties > Ticketlink intrekken). Een nieuwe QR (Acties > Nieuwe QR-code) maakt de oude direct ongeldig.
- De tekst van de mail pas je aan onder **E-mail en wallet**. Vanuit een preview gaat nooit echte mail de deur uit (`PREVIEW_MAIL_TO`).
- Veel tickets in één keer mailen kan via de API `POST /api/tickets/send` met `batchId`; een scherm daarvoor volgt.
- Apple Wallet en Google Wallet zijn nog niet gekoppeld (accounts nodig).

## Scannen (fase 3)

1. Maak onder **Scanners en ingangen** een of meer ingangen (optioneel gekoppeld aan een vak) en scanners. De PIN (6 cijfers) wordt één keer getoond. Na vijf foute pogingen is een scanner 15 minuten geblokkeerd; een nieuwe PIN, uitschakelen of rechten wijzigen maakt lopende sessies direct ongeldig.
2. Op de telefoon: open `/scan`, log in met de scannercode en PIN en kies de wedstrijd en ingang. Voor het beginscherm: "Zet op beginscherm".
3. Beheerders met het recht Tickets scannen loggen in op de Hub en openen `/scan`; zij zien ook de aantallen (binnen, waarschuwingen) als ze scanhistorie mogen zien. Een supervisor (scanner met supervisor-vinkje of Hub-recht "Scan overrulen") kan een geweigerde of dubbele scan met reden toch toelaten. Dat staat in het auditlog.
4. Scans zonder verbinding: laad vóór de wedstrijd, met verbinding, de offline-lijst ("Laden" in de scanner). Zonder bereik controleert de scanner alleen tickets uit die lijst en meldt alles later terug; de server beoordeelt elke scan dan opnieuw. De lijst is alleen op de dag van de wedstrijd beschikbaar en bevat geen volledige namen.
5. Dubbel scannen: de tweede scan geeft altijd een waarschuwing met tijd en ingang van de eerste. Alleen interne seizoenskaarten mogen opnieuw naar binnen, en alleen bij wedstrijden waarvoor "herintrede toegestaan" aanstaat.
6. Scanhistorie en aantallen staan onder **Scanhistorie**.

## Fullhouse (fase 4)

- Standaard draait alles op de testprovider. Voor een echte koppeling: `FULLHOUSE_MODE=sandbox` (eerst!) of `production`, en `FULLHOUSE_API_KEY` (alleen lezen). Een access-user-token (`FULLHOUSE_ACCESS_TOKEN`) is een alternatief.
- Onder **Fullhouse**: koppeling controleren (toont alleen veldnamen), evenementen ophalen (komen als concept binnen; activeer ze bij Wedstrijden), tickets synchroniseren (volledig of alleen wijzigingen) en het synchronisatielog.
- Webhook-URL voor Fullhouse: `https://<domein>/api/webhooks/fullhouse`, met `FULLHOUSE_WEBHOOK_SECRET` als sleutel. Een gebeurtenis start alleen een gerichte, alleen-lezen synchronisatie.
- Dagelijks om 04:00 draait `/api/cron/tickets` (met `CRON_SECRET`): nieuwe Fullhouse-evenementen worden als concept opgehaald, de tickets van alle wedstrijden van gisteren tot 120 dagen vooruit worden gesynchroniseerd (alleen lezen), en de bewaartermijnen lopen (anonimiseren, oude scans en logs wissen). Vaker dan dagelijks kan alleen via de webhook of een betaald Vercel-abonnement.
- De Hub bewaart van Fullhouse-tickets alleen een hash van de barcode en initialen van de naam.

## Rapportages en CZ (fase 5)

- **Rapportages en export**: per wedstrijd uitgegeven, binnen, niet gescand, per type, per ingang en per kwartier. Export als CSV, Excel of PDF. Contactgegevens staan alleen in de export als je het recht "Contactgegevens zien" hebt. Cellen die met `=`, `+`, `-` of `@` beginnen worden onschadelijk gemaakt.
- **Commerciële Zaken**: `issueFromCommercial` en `usageForCompany` in `commercial-bridge.server.ts`. Idempotent per `(originSystem, externalRef)`, met dezelfde rechten en controles als het scherm. Boven de drempel wordt niet uitgegeven maar teruggemeld dat dit via Bulkuitgifte moet. Er is nog geen scherm in CZ dat dit aanroept.

## Testen

- `npm test` draait alle tests. Met `TEST_DATABASE_URL` (een lege Postgres) draaien ook de databasetests: uitgifte, goedkeuring, scannen (ook twee scanners tegelijk), scanner-inlog, synchronisatie, bewaartermijnen, CZ-koppeling en exports.
- In ontwikkeling en previews staat Fullhouse op de testprovider met voorbeeldbarcodes `FH-TEST-0001` t/m `FH-TEST-0050` (geldig) en `FH-TEST-INVALID` (ongeldig). Maak een wedstrijd en zet `externalId` op `mock-event-1` (via Fullhouse > Evenementen ophalen) om Fullhouse-scans te proberen. Er worden geen echte mails verstuurd vanuit een preview.

## Bekende beperkingen

- Apple Wallet en Google Wallet (accounts nodig), geplande rapportagemails en een CZ-scherm voor uitgifte ontbreken nog.
- Pasfoto's bij tickets zijn niet gebouwd.
- De echte Fullhouse-koppeling is nog niet getest, zie `architectuur.md` §13.
- Toegang tot HHC Tickets geeft alleen de hoofdadmin; delegatie volgt later.
