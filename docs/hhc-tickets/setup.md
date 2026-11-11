# HHC Tickets: setup en gebruik (fase 1)

Zie `architectuur.md` voor het ontwerp van het hele product. Dit bestand beschrijft wat je nodig hebt om fase 1 te draaien.

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
| `FULLHOUSE_MODE` | 3-4 | `mock` (standaard), `sandbox` of `production`. Een preview gebruikt nooit `production`. |
| `FULLHOUSE_API_BASE` | 3-4 | Standaard `https://vivenu.com/api` (sandbox: `https://vivenu.dev/api`) |
| `FULLHOUSE_API_KEY` | 4 | API-sleutel (alleen lezen), nooit in code of chat |
| `FULLHOUSE_ACCESS_TOKEN` | 3-4 | Token van een access user (scanapparaat) in het Fullhouse-dashboard |
| `FULLHOUSE_WEBHOOK_SECRET` | 4 | HMAC-sleutel van de webhook |
| Apple/Google Wallet | 2 | Zie `architectuur.md` §11 |

Onder HHC Tickets > Instellingen zie je welke sleutels zijn ingesteld (alleen ja/nee, nooit de waarde).

## Wat fase 1 doet

- Wedstrijden, seizoenen, toegangsvakken en tickettypes beheren (geldig voor één wedstrijd, meerdere wedstrijden, seizoen of periode; vervalt automatisch na de wedstrijd).
- Tickets uitgeven: één per keer, meerdere tegelijk, of via CSV/Excel (sjabloon beschikbaar). Boven de drempel (standaard 50, instelbaar) is goedkeuring door een andere bevoegde collega nodig.
- Ticketoverzicht met zoeken, blokkeren, annuleren, heractiveren, opnieuw uitgeven (nieuwe QR-versie) en anonimiseren. Altijd met reden en in het auditlog.
- Dashboard en auditlog. Scans, Fullhouse-aantallen en live bezoekers staan als "volgt" op het dashboard.
- QR-formaat is klaar: `HHC1.<kenmerk>.<versie>.<handtekening>` (geen persoonsgegevens, HMAC-SHA256). De QR wordt nog nergens getoond; dat gebeurt in fase 2 op de ticketpagina.

## Testen

- `npm test` draait de unit-tests (token, regels, uitgifte, bulk, rechten, Excel).
- Met `TEST_DATABASE_URL` (een lege Postgres) draaien ook de databasetests (`tickets.integration.test.ts`), die uitgifte, goedkeuring, statuswijzigingen, anonimiseren en afscherming controleren.
- In ontwikkeling en previews staat Fullhouse op de testprovider met voorbeeldbarcodes `FH-TEST-0001` t/m `FH-TEST-0050` (geldig) en `FH-TEST-INVALID` (ongeldig). Er worden geen echte mails verstuurd vanuit een preview.

## Bekende beperkingen fase 1

- Geen e-mail, ticketpagina, PDF of wallet (fase 2) en geen scanner (fase 3).
- Pasfoto en e-mailtemplates volgen in fase 2.
- Toegang tot HHC Tickets geeft alleen de hoofdadmin; delegatie volgt later.
