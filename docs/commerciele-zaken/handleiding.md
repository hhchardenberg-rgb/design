# Commerciële Zaken – handleiding, beheer en oplevering

Beschermde sectie van de HHC Hub voor de sponsorcommissie. Alles hieronder is gebouwd en getest tenzij onder
"Niet gebouwd" anders staat.

## 1. Wat er is gebouwd

| Onderdeel | Wat je kunt |
| --- | --- |
| Sponsoren (dossiers) | Aanmaken, zoeken, filteren, archiveren, dubbelen herkennen, samenvoegen, CSV-import met controle vooraf |
| Contacten en historie | Contacten per dossier, contactmomenten (gesprek, bezoek, mail, offerte…) met vervolgtaak in één stap |
| Bestanden | Uploaden bij een dossier, versies, beveiligd downloaden (de opslag-URL komt nooit in de browser) |
| Taken | Eigen en teamtaken, afvinken, bereik eigen/team/alles |
| Seizoenen en pakketten | Seizoenen, pakketten met onderdelen; een contract bewaart een momentopname van het pakket |
| Contracten | Concept, lopend, afgelopen, geannuleerd; verlengen (nieuw concept op basis van het vorige); opzegdatum |
| Tegenprestaties | Toezeggingen per contract met status en datum |
| Pijplijn | Kansen per fase, verloren-reden, winnen maakt in één keer een concept-contract |
| Indexatie | Percentage op concept-verlengingen met voorbeeld; één keer per verlenging; geschiedenis |
| Rapportages | Contracten per status en pakket, pijplijnstand; CSV-export van contracten en sponsoren |
| Herinneringen | Dagelijkse mail met verlopen taken en naderende opzegdata (30/14/7 dagen) |
| Mailings | Bericht aan sponsorcontacten, ontvangerslijst, versturen, resultaat per ontvanger, afmelden |
| Rechten | Rollen als sjabloon, per persoon toestaan/weigeren, bereik, audit, delegatiegrens |

## 2. Rechten

**Toegang tot de sectie** is los van de platformrol. Een platformbeheerder (ADMIN) heeft *geen* impliciete toegang;
die geeft toegang aan personen via Beheer > Commerciële Zaken. Bestaande gebruikers krijgen niets automatisch.

Een bevoegdheid heet `onderdeel:actie` (bijvoorbeeld `contracts:update`, `amounts:read`, `mailings:send`).
Er is bewust geen "verwijderen": dossiers worden gearchiveerd.

**Rolsjablonen** (aanpasbaar of te vervangen):

| Rol | Kort |
| --- | --- |
| Alleen lezen | Dossiers, contacten, kansen, tegenprestaties, taken, bestanden bekijken. Geen bedragen |
| Sponsorcommissielid | Dossiers, contacten, historie, taken bewerken; contracten lezen. Geen financiën |
| Relatiebeheerder | Relaties, kansen, tegenprestaties, bestanden beheren; contracten, bedragen, rapportages lezen |
| Contractbeheerder | Contracten en bedragen bewerken; definitief maken is aparte bevoegdheid |
| Financieel medewerker | Rechten voor facturen/creditnota's/betalingen (de schermen zijn nog niet gebouwd, zie §7) |
| Mailingbeheerder | Mailings voorbereiden en resultaten zien, niet versturen |
| Beheerder Commerciële Zaken | Alles, inclusief rechtenbeheer binnen de delegatiegrens |

**Persoonlijke afwijkingen**: per bevoegdheid toestaan of weigeren, bovenop de rol (weigeren wint).
**Bereik** (dossiers en taken): *eigen*, *eigen team* of *alles*; wordt op de server afgedwongen. Buiten bereik
geeft "niet gevonden", zodat het bestaan van een dossier niet te raden is.
**Delegatiegrens**: je kunt anderen alleen rechten geven die je zelf hebt; je kunt je eigen rechten niet verhogen.
**Financiële zichtbaarheid** is apart (`amounts:read`): zonder dat recht zie je nergens bedragen, ook niet in
totalen, rapporten, exports of de pijplijn. Indexatie toepassen vraagt `amounts:approve` en `amounts:update`.
**Auditlog**: wijzigingen in rechten, eigenaren, teams, indexaties, mailings en exports worden vastgelegd, zonder
bedragen, adressen of berichttekst.

## 3. Dagelijks gebruik (voor de sponsorcommissie)

1. **Sponsoren**: zoek of maak een dossier. Het systeem waarschuwt bij een mogelijk dubbel dossier.
2. **Contact vastleggen**: tab Historie, "Contactmoment toevoegen"; zet meteen een vervolgtaak.
3. **Contract**: tab Contracten. Kies seizoen en pakket, vul bedrag (excl. btw) en data in, zet het op lopend.
   Een pakket is verplicht om te activeren.
4. **Verlengen**: tab Contracten > Verlengen maakt een concept voor het volgende seizoen.
5. **Indexeren**: Commerciële Zaken > Indexatie: seizoen, percentage, afronding, voorbeeld, toepassen.
6. **Pijplijn**: verplaats een kans door de fasen; "Winnen" maakt een concept-contract.
7. **Mailing**: Mailings > Nieuw. Schrijf het bericht (`{{naam}}` wordt de naam van het contact), kies een
   doelgroep, "Ontvangers voorbereiden", controleer de lijst, "Versturen". Mislukte mails kun je opnieuw proberen.
8. **Rapportages**: kies een seizoen; exporteren kan als je het exportrecht hebt.

## 4. Beheer

- **Toegang geven**: Beheer > Commerciële Zaken (alleen ADMIN): zet iemand aan en kies een rol. Daarna kan een
  beheerder van Commerciële Zaken rol, afwijkingen, bereik en teams afstellen (Instellingen > Rechten / Teams).
- **Teams**: Instellingen > Teams; teamlidmaatschap bepaalt het bereik "eigen team" en is een rechtenwijziging.
- **Seizoenen en pakketten**: Instellingen > Seizoenen en pakketten.
- Wie alleen toegang heeft tot Commerciële Zaken (geen hub-/ticketingrol) wordt na het inloggen automatisch naar
  `/commercieel` gestuurd.

## 5. Instellingen en externe afhankelijkheden (Vercel)

| Variabele | Doel | Nodig voor |
| --- | --- | --- |
| `COMMERCIAL_ENABLED=true` | Zet de sectie aan (standaard uit) | Alles |
| `AUTH_SECRET` | Bestaat al; ondertekent ook afmeldlinks | Mailings |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Bestaan al; mailverzending | Herinneringen, mailings |
| `CRON_SECRET` | Beveiligt de dagelijkse cron (lange willekeurige waarde) | Herinneringen |
| `RESEND_WEBHOOK_SECRET` | Signing secret van de Resend-webhook | Resultaten van mailings |
| `STORAGE_DRIVER` en bijbehorende opslag | Bestandsopslag (Vercel Blob) | Bestanden |

- **Cron**: `vercel.json` roept elke dag 06:00 UTC `/api/cron/commercial-reminders` aan. Zonder `CRON_SECRET`
  is de route dicht en doet hij niets zolang de sectie uit staat.
- **Resend-webhook**: maak in Resend een webhook naar
  `https://communicatie.hhc-hardenberg.nl/api/webhooks/resend` met de events delivered, bounced, complained en
  opened; zet het signing secret als `RESEND_WEBHOOK_SECRET`. Een harde bounce of klacht meldt het adres automatisch af.
- **Afzenderdomein**: zolang het domein in Resend niet geverifieerd is, mag Resend alleen naar het adres van de
  Resend-eigenaar sturen. Verifieer het domein vóór de eerste echte mailing.
- **Database**: preview en productie delen één database. Alle wijzigingen zijn additief (alleen nieuwe tabellen en
  kolommen), de bestaande gegevens blijven ongemoeid. Wees dus voorzichtig met echte acties (mailings!) in een preview.

## 6. Activeren en terugdraaien

**Activeren (aanbevolen volgorde)**
1. Zet `CRON_SECRET` en (voor mailings) `RESEND_WEBHOOK_SECRET`; verifieer het mailingdomein in Resend.
2. Zet `COMMERCIAL_ENABLED=true` in Vercel (productie) en deploy opnieuw.
3. Geef als platformbeheerder jezelf of een aanspreekpunt toegang (Beheer > Commerciële Zaken) met rol "Beheerder".
4. Laat die persoon teams, seizoenen, pakketten en de overige rollen instellen en de sponsorcommissie uitnodigen.
5. Importeer bestaande sponsoren (Sponsoren > Importeren) en controleer het voorbeeld voor je bevestigt.

**Terugdraaien**
- *Direct uitzetten*: `COMMERCIAL_ENABLED` op `false` (of verwijderen) en opnieuw deployen. Menu, schermen en API's
  verdwijnen (404), de cron slaat over. De gegevens blijven in de database staan.
- *Eén persoon uitsluiten*: toegang intrekken in Beheer > Commerciële Zaken; werkt direct.
- *Code terugdraaien*: een eerdere deployment promoten in Vercel. De nieuwe tabellen blijven bestaan en
  schaden de rest van de Hub niet.

## 7. Niet gebouwd en bekende beperkingen

- **Facturen, creditnota's en betalingen**: bewust *niet* gebouwd. Daarvoor zijn de juridische gegevens van HHC
  nodig (exacte statutaire naam, adres, KvK-nummer, btw-nummer, IBAN, betalingstermijn en nummering) en die zijn
  niet aangeleverd; er is niets verzonnen. De rechten (`invoices`, `credit_notes`, `payments`) en de rol
  "Financieel medewerker" bestaan al, zodat dit later zonder rechtenmigratie kan worden toegevoegd. Bedragen
  staan in eurocenten exclusief btw; btw wordt bij facturatie bepaald.
- **Antwoorden op mailings registreren**: niet gebouwd (vraagt een inkomende mailbox).
- **Herinneringen** gaan naar de taakhouder en naar de eigenaar van het dossier; een eigen voorkeur om dit uit te
  zetten is er (nog) niet.
- Vercel Blob wordt als openbaar type opslag gebruikt; de bescherming van bestanden berust op onraadbare sleutels
  en op het feit dat de URL nooit aan de browser wordt gegeven. Overweeg een privé-opslag voor vertrouwelijke contracten.
- Een mailing die halverwege crasht kan ontvangers in de status "bezig" achterlaten; die worden bewust niet
  automatisch opnieuw verstuurd om dubbele mails te voorkomen.
- Nieuwe tabellen met een `companyId` moeten worden opgenomen in het samenvoegen van dossiers (`mergeCompanies`).

## 8. Tests

`npm test` draait 48 tests. De integratietests vragen een Postgres via `TEST_DATABASE_URL` en worden anders
overgeslagen. Gedekt: rechtenmodel en delegatie, bereik (eigen/team/alles) en lekken via dubbelencontrole,
financiële zichtbaarheid (ook in totalen, export, audit en snapshots), versiecontrole, bestanden, import en
samenvoegen, contracten en verlengen, pijplijn, indexatie, rapportages en export (inclusief formule-injectie),
herinneringen (eenmalig, geen bedragen), mailings (afmelden, eenmalig versturen, foutherstel, webhook-handtekening
en idempotentie) en een bewaking dat elke commerciële API-route de centrale toegangscontrole gebruikt.
Er is in geen enkele test echt gemaild of gefactureerd.
