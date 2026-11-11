# HHC Tickets: analyse, aannames, risico's en architectuur

Status: fase 1 (fundament) in aanbouw, 11/11/2026. Dit document beschrijft het hele product en markeert per onderdeel in welke fase het gebouwd wordt.

## 1. Analyse van de bestaande HHC Hub

| Onderwerp | Wat er is | Gevolg voor HHC Tickets |
|---|---|---|
| Stack | Next.js 16 (App Router, React 19), TypeScript, Tailwind 4, Prisma 6 op Postgres (Neon), Vercel. Tests met `node:test` via `tsx --test`. | Zelfde stack. Er komt geen nieuw framework bij. |
| Database-wijzigingen | `vercel-build` draait `prisma db push`. Previews krijgen sinds 06/11/2026 een eigen Neon-branch (kopie van productie). | Alleen additieve tabellen (`tickets_*`) en kolommen. Niets wordt hernoemd of verwijderd. |
| Authenticatie | NextAuth v5 (credentials) met verplichte 2FA voor beheerders en CZ-leden. Rollen staan in het JWT en worden elke minuut ververst. `src/proxy.ts` bewaakt routes. | De HHC Tickets-routes (`/tickets`) zijn in de proxy "alleen ingelogd". De echte rechtencontrole gebeurt per verzoek server-side uit de database, net als bij Commerciële Zaken. |
| Rollen | Eén rollensysteem (`access_roles` en `user_access_roles`, PR #53). Per rol: niveau voor Communicatie en Ticketing, en een set CZ-bevoegdheden. Hoofdadmin mag alles. | Een rol krijgt er een set **HHC Tickets-bevoegdheden** bij (`ticketsAccess` en `ticketsPermissions`). De gevraagde rollen zijn sjablonen in de rolbewerker (§5). |
| Modules en navigatie | Apps-knop met tegels (Communicatie, Ticketing, Commerciële Zaken, Beheer). CZ heeft een eigen zijmenu (`CommercialSidebar`). | Nieuwe tegel **HHC Tickets** en een eigen zijmenu in dezelfde stijl, met oranje accent. |
| Bestaande module "Ticketing" | `/ticketing` bevat ondersteuning voor medewerkers: handleidingen, standaardmails, wachtwoordgenerator, Excel-sjablonen en een snelle link naar Fullhouse. Er is geen ticketdata. | **Niet vervangen.** Ticketing blijft de kennisbank voor het ticketteam. HHC Tickets is een nieuw hoofdonderdeel naast Ticketing. Later komt er vanuit Ticketing een snelle link naar HHC Tickets. |
| E-mail | Resend (`src/lib/mail.ts`). Previews sturen nooit echte mail (`PREVIEW_MAIL_TO` optioneel). | Ticketmails gaan via dezelfde `getClient()` en erven daarmee de previewbewaking (fase 2). |
| Bestandsopslag | Vercel Blob, of S3 als dat is ingesteld (`src/lib/storage`). Gevoelige bestanden worden versleuteld opgeslagen. | Pasfoto's (fase 2) worden versleuteld opgeslagen, net als CZ-bestanden. |
| Audit-log | Hub-breed `audit_events` (login, rollen). CZ heeft daarnaast een eigen `commercial_audit_events`. | Eigen tabel `tickets_audit_events` met de gevraagde velden (ticket, wedstrijd, scanner, ingang, oude en nieuwe status, reden, apparaat). Inloggen staat al in `audit_events`. |
| Versleuteling | AES-256-GCM-veldversleuteling (`DATA_ENCRYPTION_KEY`) via een Prisma-extensie. | Het telefoonnummer van de tickethouder wordt op dezelfde manier versleuteld. |
| PDF en QR | `pdf-lib`, `qrcode`, `sharp` en `@napi-rs/canvas` zijn al aanwezig. | Er zijn geen nieuwe pakketten nodig voor de PDF en de QR-code (fase 2). Voor Apple Wallet komt mogelijk `node-forge` erbij voor PKCS#7-ondertekening; dat wordt beoordeeld in fase 2. |
| Wedstrijden | Tabel `matches` (designtool, met team, tegenstander en datum). | Een wedstrijd in HHC Tickets kan optioneel aan een bestaande `Match` gekoppeld worden, zodat datum en tegenstander niet dubbel worden ingevoerd. |
| Commerciële Zaken | Bedrijven, contactpersonen, contracten en seizoenen (`commercial_*`). | Een ticket kan optioneel een `commercialCompanyId` en `externalRef` dragen. De koppeling zelf komt in fase 5 (§9). |
| Fullhouse-documentatie | Niet in de repo, alleen een snelle link naar `dashboard.fullhouse.tech`. Jermaine leverde een pagina uit de vivenu-kennisbank aan als API-informatie. | Zie §2. |

## 2. Fullhouse

**Aanname (te bevestigen door Jermaine):** Fullhouse draait op het vivenu-platform. Daarvoor zijn drie aanwijzingen: de aangeleverde documentatie is van vivenu, de API-sleutel heeft het vivenu-formaat `key_…`, en vivenu levert white-label ticketing.

De officiële documentatie staat op docs.vivenu.dev. Daarin staat een **access-control-API** die precies doet wat de scanner nodig heeft. Alle endpoints hieronder komen letterlijk uit die documentatie; er zijn er geen verzonnen.

| Doel | Endpoint (basis `https://vivenu.com/api`, sandbox `https://vivenu.dev/api`) | Authenticatie |
|---|---|---|
| Evenementen voor dit scanapparaat | `GET /accessusers/events` | header `token: <access-user-token>` |
| Offline-cache van tickets | `GET /accessusers/tickets/v2/{eventId}?top=1..1000&skip&from&until` | idem |
| Realtime-controle van een barcode | `GET /accessusers/tickets/{barcode}?eventId=` | idem |
| Realtime scannen (inchecken) | `POST /accessusers/tickets/{barcode}/scan` geeft `{ access: "GRANTED", ticket }` | idem |
| Offline gemaakte scans terugmelden | `POST /accessusers/scans/{eventId}` met `[{ barcode, scanned_at, type: OK\|FAIL, direction: IN\|OUT, ticketId }]` | idem |
| Evenementen en tickets (beheer) | `GET /events`, `GET /tickets` (paginering met `top`/`skip`, antwoord `{ docs, total }`) | `Authorization: Bearer <API-key>` |
| Scans opvragen | `GET /scans` | idem |
| Webhooks | `ticket.created`, `ticket.updated`, `transaction.complete`, `transaction.canceled`, `transaction.partiallyCanceled`; header `x-vivenu-signature` = hex HMAC-SHA256 van de ruwe body | eigen `hmacKey` |

Ticketstatussen bij vivenu: `VALID`, `INVALID`, `RESERVED`, `DETAILSREQUIRED`, `BLANK`. Alleen `VALID` geeft toegang.

**Niet gedocumenteerd, en daarom configureerbaar of te testen:**
- Het formaat van een Fullhouse-barcode. Herkenning werkt daarom andersom: alles wat met het HHC-voorvoegsel begint, is een HHC-ticket, en al het andere gaat naar de Fullhouse-adapter.
- De andere waarden van `access` dan `GRANTED`. Alles wat geen `GRANTED` is, behandelen we als weigering, en we tonen de status van het ticket als reden.
- Rate limits. De adapter krijgt een time-out, beperkte herhaalpogingen met backoff en een eigen begrenzing.
- Of Fullhouse een eigen API-domein gebruikt in plaats van vivenu.com. Daarom is de basis-URL instelbaar via `FULLHOUSE_API_BASE`.

**Adapterlaag** (`src/lib/tickets/fullhouse/`):
- `types.ts` definieert de interface `TicketProvider` (`listEvents`, `fetchTicketsPage`, `lookupBarcode`, `scanBarcode`, `pushOfflineScans`, `verifyWebhook`).
- `vivenu-provider.ts` is de echte implementatie op de endpoints hierboven, met time-out, herhaalpogingen en logging (fase 3 en 4).
- `mock-provider.ts` is een deterministische testprovider met voorbeeldevenementen en voorbeeldbarcodes. Die is standaard in ontwikkeling en in previews.
- `index.ts` kiest de provider op basis van `FULLHOUSE_MODE=mock|sandbox|production`. Zonder geldige configuratie valt hij altijd terug op `mock`, nooit stilletjes op productie.
- Er komt geen Fullhouse-logica in de frontend. De scanner praat alleen met de eigen API.

**Credentials:** de API-sleutel staat alleen in Vercel als `FULLHOUSE_API_KEY`, en het token van het scanapparaat als `FULLHOUSE_ACCESS_TOKEN`. Ze staan nooit in code, documenten, logs of commits. Een access user (het scanapparaat) maakt HHC zelf aan in het Fullhouse-dashboard. Dan hoeft de Hub zelf geen schrijfrechten in Fullhouse te gebruiken.

## 3. Aannames

1. HHC Tickets is een nieuw hoofdonderdeel achter een featureflag `TICKETS_ENABLED` (standaard uit, net als Commerciële Zaken). In previews staat de flag aan.
2. Wedstrijden zijn evenementen met een datum. Een wedstrijd verloopt standaard 6 uur na de aftrap (instelbaar per wedstrijd).
3. Het seizoen loopt van 1 juli tot en met 30 juni, en heet in de interface "huidig seizoen", "afgelopen seizoen" of "aankomend seizoen".
4. Een ticket heeft een eigen status: `ACTIVE`, `BLOCKED` of `CANCELLED`. "Verlopen" en "gebruikt" worden afgeleid uit de geldigheid en de scans, zodat ze nooit uit de pas lopen.
5. Scanners in fase 3 zijn óf Hub-gebruikers met de rol Scanner, óf vrijwilligers zonder Hub-account die een **persoonlijke scanner-PIN** krijgen. Die PIN wordt aangemaakt door de scannercoördinator, gehasht opgeslagen en per wedstrijddag geldig. Zo hoeven vrijwilligers geen volledig Hub-account met 2FA te hebben. *(Vraag aan Jermaine, zie §10.)*
6. Interne tickets zijn persoonsgebonden en niet overdraagbaar. Opnieuw versturen gaat altijd naar dezelfde houder.

## 4. Ticketbeveiliging (QR en links)

- QR-inhoud van een HHC-ticket: `HHC1.<publicId>.<versie>.<handtekening>`
  - `publicId`: 16 willekeurige tekens (base32, ongeveer 80 bits). Er staan geen persoonsgegevens in en het is niet oplopend.
  - `versie`: de `qrVersion` van het ticket. Opnieuw uitgeven verhoogt de versie, waardoor de oude QR direct ongeldig is.
  - `handtekening`: HMAC-SHA256 met `TICKETS_SIGNING_KEY` over `HHC1.<publicId>.<versie>` met domeinlabel `qr`, ingekort tot 128 bits (base64url).
- Er wordt **geen geheim** in de database opgeslagen. De QR is alleen met de serversleutel te maken en is altijd opnieuw af te leiden voor de ticketpagina, de PDF en de wallet. Een vervalste QR wordt al op de handtekening geweigerd, nog vóór een databasequery.
- Bij elke scan controleert de server altijd de status (geblokkeerd, geannuleerd, verlopen, wedstrijd, al gebruikt). Een geldige handtekening alleen is nooit genoeg.
- Persoonlijke ticketlink: `/t/<publicId>.<linkVersion>.<handtekening>`, met domeinlabel `link`. Een link intrekken betekent `linkVersion` verhogen. De link en de QR zijn los van elkaar in te trekken.
- Sleutelrotatie: `TICKETS_SIGNING_KEY` kan meerdere sleutels bevatten (`kid:base64,kid:base64`). De eerste tekent, de rest controleert alleen. Het voorvoegsel `HHC1` laat ruimte voor een later formaat.
- Er gaat nooit een sleutel naar de scanner-app. Offline controle van HHC-tickets (fase 3) gebeurt met een vooraf gedownloade lijst van `publicId`, versie en status per wedstrijd, alleen voor ingelogde scanners.

## 5. Rollen en rechten

Rechten zijn fijnmazig en volgen het patroon van Commerciële Zaken (`gebied:actie`). De lijst staat in `src/lib/tickets/permissions.ts`. Een rol in Beheer > Gebruikers en rechten krijgt een blok "HHC Tickets" met een sjabloonkeuze:

| Sjabloon | Kern |
|---|---|
| Superadmin | Is de bestaande Hoofdadmin. Mag automatisch alles. |
| Ticketbeheerder | Alles binnen HHC Tickets, behalve rechten van anderen. |
| Ticketuitgever | Tickets bekijken, uitgeven (enkel en bulk tot de drempel) en opnieuw versturen. |
| Scannercoördinator | Wedstrijden bekijken, scanners en ingangen beheren, scanhistorie inzien, overrides doen. |
| Scanner | Alleen scannen, scanresultaten zien en een scannotitie maken. |
| Financieel beheerder | Rapportages en exports. |
| Communicatiebeheerder | E-mailtemplates, tickets bekijken en opnieuw versturen. |
| Bestuur/directie | Dashboard en rapportages, alleen lezen. |
| Alleen lezen | Dashboard, wedstrijden en tickettypes bekijken, zonder persoonsgegevens. |

Regels: alleen de hoofdadmin kent HHC Tickets-rechten toe (de delegatie volgt later, net als bij CZ). Een scanner heeft technisch geen enkel recht om uit te geven, te blokkeren, te exporteren, prijzen te wijzigen, omzet te zien of rechten te wijzigen. Bulkuitgifte boven de drempel (standaard 50, instelbaar) vraagt goedkeuring van iemand met `bulk:approve`, en dat mag niet de aanvrager zelf zijn.

## 6. Datamodel (tabellen `tickets_*`)

Fase 1:
- `TicketSeason`: naam, start- en einddatum.
- `TicketZone`: toegangstype of vak (bijvoorbeeld Tribune, VIP-ruimte, Pers).
- `TicketEvent`: wedstrijd. Bevat titel, tegenstander, competitie, aftrap, einde, seizoen, herintrede toegestaan, status (`DRAFT|ACTIVE|CLOSED|CANCELLED`), bron (`HHC|FULLHOUSE`), `externalId`, zichtbaar en actief, en optioneel een koppeling met `matches`.
- `TicketType`: naam, categorie (de 10 categorieën), geldigheidsvorm (`SINGLE|MULTI|SEASON|RANGE`), standaardvak, seizoenskaart (ja/nee), competities, herintrede, kleur en actief.
- `Ticket`: alle velden uit de opdracht (§4 daarvan), plus `publicId`, `qrVersion`, `linkVersion`, `validFrom`, `validUntil`, `seasonId`, `batchId`, `commercialCompanyId`, `externalRef`, `issuedById` en `anonymizedAt`.
- `TicketEventLink`: de wedstrijden waarvoor een ticket met de vorm SINGLE of MULTI geldig is.
- `TicketBatch`: bulkuitgifte met status `PENDING_APPROVAL|APPROVED|ISSUED|REJECTED`, aanvrager, beoordelaar en aantal.
- `TicketSettings`: drempel voor goedkeuring en bewaartermijnen per gegevenstype.
- `TicketAuditEvent`: actie, gebruiker, tijd, ticket, wedstrijd, scanner, ingang, oude en nieuwe status, reden, apparaat en IP.

Fase 2 tot en met 5: `TicketDelivery` (verzendlog), `TicketEmailTemplate`, `TicketWalletPass` (serienummer en registraties voor updates), `TicketEntrance`, `TicketScanner` (PIN-hash), `TicketScan` (bron, resultaat, reden, offline-vlag, `syncedAt`, `lateInvalid`), `FullhouseEvent` en `FullhouseTicket` (cache), `TicketSyncRun` en `TicketStatsDaily` (geanonimiseerde totalen).

## 7. Validatieregels (`src/lib/tickets/rules.ts`, getest)

Bij een scan gelden deze stappen, in deze volgorde:
1. Is het formaat herkend? Een HHC-code met een ongeldige handtekening geeft "Ticket bestaat niet".
2. Bestaat het ticket en klopt de versie? Zo niet: "Ticket bestaat niet".
3. Is het ticket geannuleerd of geblokkeerd? Dan die reden.
4. Valt de wedstrijd binnen de geldigheid (SINGLE/MULTI: gekoppelde wedstrijd; SEASON: seizoen en competities; RANGE: datums)? Zo niet: "Hoort bij een andere wedstrijd" of "Verlopen".
5. Is het ticket al gescand voor deze wedstrijd? Bij een seizoenskaart én herintrede aan voor deze wedstrijd is dat geldig (herintrede). In alle andere gevallen geeft het een **waarschuwing "Al gebruikt"**. Die wordt nooit stil als geldig geregistreerd; alleen een supervisor-override met reden kan dat.

## 8. Privacy en bewaarbeleid

- Er staan geen persoonsgegevens in de QR, het telefoonnummer wordt versleuteld en er komen geen persoonsgegevens in de audit-metadata (alleen ID's).
- Bewaartermijnen per type zijn instelbaar in `TicketSettings`: persoonsgegevens (standaard 24 maanden na de laatste geldigheid), scanlogs (24 maanden), technische logs (90 dagen) en het auditlog (400 dagen, zoals de rest van de Hub). Financiële gegevens blijven 7 jaar bewaard, maar staan bij Fullhouse.
- Anonimiseren vervangt naam, e-mailadres, telefoonnummer, bedrijf en foto, en zet `anonymizedAt`. Tickettype, categorie, wedstrijd en scans blijven bestaan, zodat totalen en rapportages kloppen.
- Exports van persoonsgegevens vragen een eigen recht (`exports:export`) en komen in het auditlog.

## 9. Koppeling met Commerciële Zaken (voorbereid)

`src/lib/tickets/commercial-bridge.ts` definieert `TicketIssueRequest` (bron, externe referentie, bedrijf, ontvangers, tickettype, wedstrijden) en `issueFromExternal()`. CZ kan later contractquota of bedrijfskaarten via die ene ingang aanbieden. Dezelfde regels gelden dan: rechten, drempel, audit en idempotentie op `externalRef`.

## 10. Open vragen en blokkades

1. **Fullhouse is vivenu?** Klopt het dat Fullhouse op vivenu draait, en is de API-basis `https://vivenu.com/api`, of heeft Fullhouse een eigen domein?
2. **Access user:** wil HHC in het Fullhouse-dashboard een access user (scanapparaat) aanmaken voor de Hub en het token in Vercel zetten? Dat is veiliger dan de Hub met de beheersleutel scans laten doen.
3. **Testomgeving:** is er een Fullhouse/vivenu-sandbox (vivenu.dev) met een eigen sleutel voor previews?
4. **Scanners:** vrijwilligers met alleen een PIN (geen Hub-account), of allemaal Hub-accounts?
5. **Apple Wallet en Google Wallet** (fase 2): HHC heeft een Apple Developer-account nodig (Pass Type ID en certificaat) en een Google Wallet Issuer-account met een service-account. Die moeten op naam van HHC staan.
6. **Afzender** voor ticketmails (bijvoorbeeld tickets@hhc-hardenberg.nl) moet binnen het geverifieerde Resend-domein vallen.

## 11. Omgevingsvariabelen

| Variabele | Waar | Doel |
|---|---|---|
| `TICKETS_ENABLED` | Production/Preview | Featureflag (`true` = aan) |
| `TICKETS_SIGNING_KEY` | Production/Preview (verschillende waarden) | QR- en linkhandtekening. Formaat `kid:base64` (32 bytes), meerdere gescheiden door komma's. Aanmaken met `openssl rand -base64 32`. |
| `FULLHOUSE_MODE` | | `mock` (standaard), `sandbox` of `production` |
| `FULLHOUSE_API_BASE` | | Standaard `https://vivenu.com/api` of `https://vivenu.dev/api` |
| `FULLHOUSE_API_KEY` | Production | Beheersleutel. Alleen lezen (evenementen, tickets). |
| `FULLHOUSE_ACCESS_TOKEN` | Production | Token van het scanapparaat (access user) |
| `FULLHOUSE_WEBHOOK_SECRET` | Production | HMAC-sleutel van de webhook |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_P12_BASE64`, `APPLE_PASS_CERT_PASSWORD`, `APPLE_WWDR_CERT_BASE64` | fase 2 | Apple Wallet |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64` | fase 2 | Google Wallet |

## 12. Fasering

| Fase | Inhoud | Status |
|---|---|---|
| 1 Fundament | Module, datamodel, wedstrijden, vakken, tickettypes, interne tickets (enkel, meerdere en CSV met goedkeuring), statussen (blokkeren, annuleren, heractiveren, opnieuw uitgeven), rollen, auditlog, basisdashboard, QR-token, regels en tests | In aanbouw |
| 2 Aflevering | Ticketmail, persoonlijke ticketpagina met QR, PDF, Apple Wallet, Google Wallet, intrekken, opnieuw versturen, deelbare link | |
| 3 Scanner | PWA `/scan`, PIN, ingangen, realtime en offline, dubbele scans, overrides, scanhistorie, Fullhouse-scan via de adapter | |
| 4 Fullhouse | Evenementen importeren en activeren, ticketcache, webhooks, periodieke synchronisatie (cron), synclog, terugmelden van offline scans | |
| 5 Uitbreiding | Uitgebreide rapportages, Excel- en PDF-export, geplande rapportagemails, walletupdates, koppeling met CZ | |
