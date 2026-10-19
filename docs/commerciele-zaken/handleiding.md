# Commerciële Zaken – handleiding, beheer en oplevering

Beschermde sectie van de HHC Hub voor Commerciële Zaken. Alles hieronder is gebouwd en getest tenzij onder
"Niet gebouwd" anders staat.

## 1. Wat er is gebouwd

| Onderdeel | Wat je kunt |
| --- | --- |
| Sponsoren (dossiers) | Aanmaken, zoeken, filteren, archiveren, dubbelen herkennen, samenvoegen, CSV-import met controle vooraf |
| Contacten en historie | Contacten per dossier, contactmomenten (gesprek, bezoek, mail, offerte…) met vervolgtaak in één stap |
| Bestanden | Uploaden bij een dossier, versies, beveiligd downloaden (de opslag-URL komt nooit in de browser) |
| Logo's | Logo's bij een sponsor, liefst als vectorbestand (EPS, AI, SVG, PDF; PNG en JPG kan ook), met voorbeeld in de Hub en het origineel downloadbaar |
| Meldingen | E-mail aan aangewezen mensen zodra er een nieuw sponsorcontract is afgesloten |
| Taken | Eigen en teamtaken, afvinken, bereik eigen/team/alles |
| Seizoenen en pakketten | Seizoenen, pakketten met onderdelen; een contract bewaart een momentopname van het pakket |
| Contracten | Concept, lopend, afgelopen, geannuleerd; verlengen (nieuw concept op basis van het vorige); opzegdatum |
| Tegenprestaties | Toezeggingen per contract met status en datum |
| Pijplijn | Kansen per fase, verloren-reden, winnen maakt in één keer een concept-contract |
| Indexatie | Percentage op concept-verlengingen met voorbeeld; één keer per verlenging; geschiedenis |
| Rapportages | Contracten per status en pakket, pijplijnstand; CSV-export van contracten en sponsoren |
| Herinneringen | Mail met verlopen en naderende taken en opzegdata (30/14/7 dagen); dagelijks, twee keer per week, wekelijks, om de week, maandelijks of uit |
| Mailings | Bericht aan sponsorcontacten, ontvangerslijst, versturen, resultaat per ontvanger, afmelden |
| Facturen | Concept, definitief maken (doorlopend nummer), btw per regel, creditnota, betalingen, pdf op het briefpapier van het persbericht, versturen per e-mail met pdf-bijlage |
| Rechten | Rollen als sjabloon, per persoon toestaan/weigeren, bereik, audit, delegatiegrens; alles in Beheer > Gebruikers en rechten |
| Menu | Vaste kolom links met groepen (Relaties, Afspraken, Financiën, Communicatie, Instellingen) en een startpagina met tegels |

## 2. Rechten

**De site heeft drie onderdelen**: Communicatie, Ticketing en Commerciële Zaken. Gebruikers zien alleen de onderdelen
waarbij ze zijn aangesloten. Er is één beheer (Beheer), met drie soorten beheerders:

- **Hoofdadmin** (ADMIN): ziet en beheert alles, ook Commerciële Zaken inclusief bedragen, zonder aparte toegang.
- **Beheerder per onderdeel**: Communicatiebeheerder en Ticketingbeheerder (platformrollen) en Beheerder Commerciële Zaken
  (rol met rechtenbeheer). Zo iemand beheert alleen dat onderdeel. Iemand kan beheerder van meerdere onderdelen zijn.
- **Gebruiker**: aangesloten bij één of meer onderdelen, zonder beheer.

Toegang tot Commerciële Zaken geef je via Beheer > Gebruikers en rechten (blok "Commerciële Zaken" in de kaart van de gebruiker).

Een bevoegdheid heet `onderdeel:actie` (bijvoorbeeld `contracts:update`, `amounts:read`, `mailings:send`).
Er is bewust geen "verwijderen": dossiers worden gearchiveerd.

**Rolsjablonen** (aanpasbaar of te vervangen):

| Rol | Kort |
| --- | --- |
| Alleen lezen | Dossiers, contacten, kansen, tegenprestaties, taken, bestanden bekijken. Geen bedragen |
| Commissielid | Dossiers, contacten, historie, taken bewerken; contracten lezen. Geen financiën |
| Relatiebeheerder | Relaties, kansen, tegenprestaties, bestanden beheren; contracten, bedragen, rapportages lezen |
| Contractbeheerder | Contracten en bedragen bewerken; definitief maken is aparte bevoegdheid |
| Financieel medewerker | Facturen, creditnota's en betalingen beheren, definitief maken, downloaden en versturen |
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

## 3. Dagelijks gebruik

0. **Startpagina**: bovenaan staat een overzicht met je open taken, aflopende contracten (90 dagen), openstaande facturen,
   de pijplijn en de tegenprestaties. Je ziet alleen blokken waar je recht op hebt, binnen je eigen bereik; bedragen alleen met leesrecht.
1. **Sponsoren**: zoek of maak een dossier. Het systeem waarschuwt bij een mogelijk dubbel dossier.
2. **Contact vastleggen**: tab Historie, "Contactmoment toevoegen"; zet meteen een vervolgtaak.
3. **Contract**: tab Contracten. Kies seizoen en pakket, vul bedrag (excl. btw) en data in, zet het op lopend.
   Een pakket is verplicht om te activeren.
4. **Verlengen**: tab Contracten > Verlengen maakt een concept voor het volgende seizoen.
5. **Indexeren**: Commerciële Zaken > Indexatie: seizoen, percentage, afronding, voorbeeld, toepassen.
6. **Pijplijn**: verplaats een kans door de fasen; "Winnen" maakt een concept-contract.
7. **Mailing**: Mailings > Nieuw. Schrijf het bericht (`{{naam}}` wordt de naam van het contact), kies een
   doelgroep, "Ontvangers voorbereiden", controleer de lijst, "Versturen". Mislukte mails kun je opnieuw proberen.
   Met "Testmail versturen" stuur je het bericht, zoals het in het scherm staat, naar een e-mailadres naar keuze (maximaal
   10 per uur, alleen met het recht om te versturen). Er gaat niets naar sponsoren; het onderwerp begint met [TESTMAIL].
   Mailings krijgen automatisch de HHC-opmaak: logo, een dunne oranje balk, rustige witte kaart en een afmeldregel onderaan.
8. **Tegenprestaties**: Tegenprestaties in het menu toont per seizoen wat HHC nog moet leveren, met
   afvinken, status (gepland, bezig, vervallen) en een markering "te laat" na de einddatum.
9. **Rapportages**: kies een seizoen; exporteren kan als je het exportrecht hebt.

## Sponsorvormen

Elke sponsor kan een **sponsorvorm** hebben: Hoofd, Platina, Goud, Zilver of Overig (kies hem in het dossier of bij Nieuw bedrijf).
De vorm staat als aparte kolom in Sponsoren en Contracten, waar je er ook op filtert (meerdere vormen tegelijk, of "Zonder vorm").
Rapportages tonen lopende contracten per sponsorvorm, de exports bevatten de vorm, en de import herkent een kolom "Sponsorvorm".
Bij Mailings kies je welke sponsorvormen de mailing krijgen (leeg = alle vormen). Dat staat los van het vrije veld "Overige
categorie", dat voor eigen indelingen blijft bestaan.

## Seizoenen

Seizoenen heten in de Hub **huidig seizoen** (vandaag valt tussen start- en einddatum), **afgelopen seizoen** (einddatum
voorbij) of **aankomend seizoen** (nog niet begonnen). Dat volgt automatisch uit de datums; in keuzelijsten staat het achter de
naam, bijvoorbeeld "2026/2027 (huidig)". Los daarvan kan een beheerder per seizoen de status Concept, Open voor contracten of
Afgesloten kiezen; op een afgesloten seizoen kun je geen contracten meer afsluiten. Alle datums staan als dd/mm/jjjj.

## Contactpersonen en Excel-export

Per bedrijf koppel je zoveel contactpersonen als nodig, elk met naam, functie, e-mail, telefoon en een contactrol. De
volgorde staat in het dossier (tab Contactpersonen): bovenaan staat de eerste contactpersoon, daaronder de tweede,
enzovoort. Met de pijltjes verschuif je iemand; een nieuwe contactpersoon komt onderaan. Met "Bewerken" pas je functie of
gegevens aan. Bestaande contactpersonen kregen bij de invoering de volgorde waarin ze zijn aangemaakt.

De **Excel-export** (.xlsx) staat bij Rapportages en in het overzicht Sponsoren (daar met de gekozen sponsorvormfilter). Kies
een of meer sponsorvormen of "Zonder vorm"; niets gekozen betekent alle bedrijven. Blad "Bedrijven" heeft één rij per
bedrijf met contact 1, contact 2, ... naast elkaar (naam, functie, e-mail, telefoon). Blad "Contactpersonen" heeft één rij
per persoon. De export vraagt het exportrecht plus leesrecht op dossiers en contactpersonen, toont alleen bedrijven binnen
je recordbereik en wordt in het auditlog vastgelegd.

## Doelen en prognose

Menu Financiën → **Doelen en prognose**. Kies een seizoen: je ziet per sponsorvorm (en in totaal) het doel, wat al loopt, wat de pijplijn gewogen nog oplevert, wat er nog nodig is en het tekort na de prognose.

- **Doelen instellen** kan met "Instellingen beheren" én bedragenrecht; een leeg veld verwijdert het doel. Het logboek bewaart welk doel is gezet of gewijzigd, zonder het bedrag.
- **Loopt** = lopende contracten met een bedrag (excl. btw). Concepten staan eronder en tellen niet mee.
- **Pijplijn (gewogen)**: open kansen met een verwachte sluitdatum binnen het seizoen, gewogen naar fase: Lead 10%, Gesproken 25%, Voorstel 50%, Onderhandeling 75%. Dit zijn werkafspraken, geen metingen (staat ook op het scherm; aanpassen kan op één plek in `src/lib/commercial/forecast.ts`). Kansen zonder verwachte datum of zonder bedrag tellen niet mee en worden apart gemeld.
- Zonder bedragenrecht zie je alleen aantallen. Met een beperkt bereik ("alleen eigen" of "eigen team") zie je wel cijfers maar geen "nog nodig" en voortgang, omdat het doel voor de hele vereniging geldt.

## Herinneringen aan contactmomenten

Menu Instellingen → **Herinneringen** (alleen beheerders kunnen wijzigen; niet persoonlijk aan te passen). Per sponsorvorm (en voor sponsoren zonder vorm) stellen beheerders in na hoeveel dagen zonder contactmoment een sponsor gemeld wordt. Het overzicht staat onder Relaties → **Contactmomenten**. Iedereen kan daar of in het sponsordossier een sponsor voor zichzelf **op stil** zetten: dan geen herinneringen meer over contactmomenten en opzegdata van die sponsor (toegewezen taken komen wel). Beheerders zien onder Instellingen → Herinneringen wie welke sponsor op stil zette en kunnen dat weer aanzetten. Leeg laten = geen herinnering; er is geen standaardtermijn.

- Alleen sponsoren met status "Actief" tellen mee. Een vastgelegd contactmoment in het verleden telt; een geplande afspraak niet. Staat er een afspraak in de toekomst gepland, dan wordt de sponsor niet gemeld.
- Sponsoren zonder enig contactmoment worden gemeten vanaf het aanmaken van het dossier.
- De eigenaar van het dossier krijgt het in de herinneringsmail (zelfde cron als taken en opzegdata; frequentie in te stellen in het eigen profiel), eenmalig per sponsor en daarna bij aanhoudende stilte opnieuw na elke 30 dagen. De mail bevat geen bedragen.
- Het dashboard toont een kaart "Contactmoment nodig" met jouw sponsoren. Termijnen wijzigen vraagt "Instellingen beheren" en wordt gelogd.

## Logo's

In het sponsordossier, tab **Bestanden**: kies categorie **Logo** en upload het bestand. Liefst een vectorbestand: **EPS**,
**AI**, **SVG** of **PDF**; PNG, JPG en WEBP kan ook. Maximaal 4 MB per bestand. EPS, AI en SVG kun je alleen als Logo of
Advertentie of materiaal toevoegen.

- Een browser kan EPS en AI niet tonen. De Hub maakt daarom bij het uploaden zelf een **voorbeeld** (PNG) om te bekijken; het
  origineel blijft ongewijzigd bewaard en download je met **Origineel**. Gebruik voor drukwerk en de designtool altijd het origineel.
- Het voorbeeld komt uit het bestand zelf: bij PDF en AI de eerste pagina, bij SVG de tekening, bij EPS het ingebouwde voorbeeld
  dat programma's als Illustrator meestal meesturen. Zit er in een EPS geen voorbeeld, dan staat er "Geen voorbeeld beschikbaar"
  en kun je met **Voorbeeld toevoegen** los een PNG, JPG, PDF of SVG kiezen die alleen als voorbeeld dient.
- Het nieuwste logo met voorbeeld staat naast de naam bovenin het dossier en als klein plaatje in het overzicht Sponsoren.
  Een nieuwe versie uploaden gaat met **Nieuwe versie** in de bestandenlijst; oude versies blijven in de geschiedenis.
- Het voorbeeld bekijken kan iedereen die bestanden mag lezen; het origineel downloaden vraagt het downloadrecht en komt in het logboek.
  SVG-bestanden worden nooit rechtstreeks in de browser geopend (ze kunnen scripts bevatten), alleen gedownload of als voorbeeld getoond.

## Meldingen bij een nieuw contract

Menu Instellingen → **Meldingen**. Beheerders (Instellingen beheren) wijzen aan wie een e-mail krijgt zodra er een nieuw
sponsorcontract is afgesloten: Hub-gebruikers, of losse e-mailadressen van bijvoorbeeld bestuursleden zonder account.

- "Afgesloten" betekent: een contract gaat van **concept** naar **lopend** (Activeren in de tab Contracten). Een verlenging
  telt dus ook mee zodra die wordt geactiveerd.
- De mail noemt sponsor, sponsorvorm, seizoen (huidig, afgelopen of aankomend seizoen), pakket, looptijd (dd/mm/jjjj) en wie
  het afsloot, met een knop naar het dossier. Er staan **nooit bedragen** in.
- Iedereen krijgt per contract hooguit één melding. Na het activeren zie je in beeld naar hoeveel mensen de melding ging.
- In een preview (testomgeving) wordt nooit echt gemaild: je ziet dan alleen naar hoeveel mensen de melding zou gaan.
- Wie wordt toegevoegd of verwijderd komt in het logboek.

## 4. Beheer

- **Toegang en rechten**: alles staat bij Beheer > Gebruikers en rechten (hoofdadmin; beheerders per onderdeel zien alleen hun eigen onderdeel). In de kaart van een
  gebruiker zit het blok "Commerciële Zaken": toegang geven of intrekken met een startrol, en daarna "Rechten
  instellen" voor rol, bereik en afwijkingen. Onderaan de pagina beheer je de rollen en zie je de laatste
  wijzigingen. Rechten instellen, toegang geven en rollen beheren kan een hoofdadmin of een Beheerder Commerciële Zaken, binnen de eigen
  bevoegdheden.
  De oude pagina's Beheer > Commerciële Zaken en Instellingen > Rechten verwijzen hierheen.
- **Facturatie-instellingen**: Instellingen > Facturatie: gegevens van de vereniging, btw-nummer, IBAN,
  betalingstermijn en nummering. Zolang btw-nummer, IBAN, termijn en volgnummers leeg zijn, kan geen factuur
  definitief worden gemaakt. Het briefpapier toont zelf ook een IBAN; controleer dat beide kloppen.
- **CZ-teams**: Instellingen > CZ-teams; teamlidmaatschap bepaalt het bereik "eigen team" en is een rechtenwijziging.
  Een CZ-team wissen kan ook (rechtenbeheer vereist): dossiers en taken blijven bestaan maar horen dan bij geen team, dus wie ze
  alleen via dat team zag, ziet ze niet meer. De naam komt daarna weer vrij.
- **Seizoenen en pakketten**: Instellingen > Seizoenen en pakketten.
- **Meldingen**: Instellingen > Meldingen: wie een e-mail krijgt bij een nieuw afgesloten sponsorcontract (zie hierboven).
- Wie alleen toegang heeft tot Commerciële Zaken (geen hub-/ticketingrol) wordt na het inloggen automatisch naar
  `/commercieel` gestuurd.

- **Toezicht** (alleen met rechtenbeheer: hoofdadmin en Beheerder Commerciële Zaken): onder Toezicht in het menu.
  *Per persoon* toont voor iedereen de openstaande taken (met achterstallige), open kansen, tegenprestaties onder
  verantwoordelijkheid, dossiers als eigenaar en de laatste handelingen. *Logboek* toont wie wat deed (rechten, dossiers,
  contracten, facturen, mailings, bestanden, exports) met filter op persoon, soort en datum. Beide zijn bewust niet
  beperkt door het eigen recordbereik van de beheerder, en bevatten nooit bedragen.

- **Profiel**: onder Profiel (rechtsboven) pas je je naam, functie en telefoonnummer aan, kies je hoe vaak je de
  herinneringsmail van Commerciële Zaken krijgt (standaard, dagelijks, twee keer per week op maandag en donderdag, wekelijks
  op maandag, om de week op maandag, op de eerste maandag van de maand, of uit), zie je waar je bij aangesloten bent en wijzig je je wachtwoord
  (huidig wachtwoord vereist). Tweestapsverificatie en passkeys staan op het tabblad Beveiliging. Een gewijzigde naam is in de
  balk bovenin pas na opnieuw inloggen zichtbaar.

## 5. Instellingen en externe afhankelijkheden (Vercel)

| Variabele | Doel | Nodig voor |
| --- | --- | --- |
| `COMMERCIAL_ENABLED=true` | Zet de sectie aan (standaard uit) | Alles |
| `AUTH_SECRET` | Bestaat al; ondertekent ook afmeldlinks | Mailings |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Bestaan al; mailverzending | Herinneringen, mailings |
| `CRON_SECRET` | Beveiligt de dagelijkse cron (lange willekeurige waarde) | Herinneringen |
| `RESEND_WEBHOOK_SECRET` | Signing secret van de Resend-webhook | Resultaten van mailings |
| `STORAGE_DRIVER` en bijbehorende opslag | Bestandsopslag (Vercel Blob) | Bestanden |
| `MFA_ENCRYPTION_KEY` | Bestaat al voor Production; een preview die dezelfde database gebruikt heeft dezelfde waarde nodig, anders is elke 2FA-code "ongeldig" | Inloggen met 2FA op een preview |

- **Cron**: `vercel.json` roept elke dag 06:00 UTC `/api/cron/commercial-reminders` aan. Zonder `CRON_SECRET`
  is de route dicht en doet hij niets zolang de sectie uit staat.
- **Resend-webhook**: maak in Resend een webhook naar
  `https://hub.hhc-hardenberg.nl/api/webhooks/resend` met de events delivered, bounced, complained en
  opened; zet het signing secret als `RESEND_WEBHOOK_SECRET`. Een harde bounce of klacht meldt het adres automatisch af.
- **Afzenderdomein**: zolang het domein in Resend niet geverifieerd is, mag Resend alleen naar het adres van de
  Resend-eigenaar sturen. Verifieer het domein vóór de eerste echte mailing.
- **Database**: preview en productie delen één database. Alle wijzigingen zijn additief (alleen nieuwe tabellen en
  kolommen), de bestaande gegevens blijven ongemoeid. Wees dus voorzichtig met echte acties (mailings!) in een preview.

## 6. Activeren en terugdraaien

**Activeren (aanbevolen volgorde)**
1. Zet `CRON_SECRET` en (voor mailings) `RESEND_WEBHOOK_SECRET`; verifieer het mailingdomein in Resend.
2. Zet `COMMERCIAL_ENABLED=true` in Vercel (productie) en deploy opnieuw.
3. Geef als hoofdadmin een aanspreekpunt toegang (Beheer > Gebruikers en rechten) met rol "Beheerder".
4. Laat die persoon teams, seizoenen, pakketten en de overige rollen instellen en de gebruikers uitnodigen.
5. Importeer bestaande sponsoren (Sponsoren > Importeren) en controleer het voorbeeld voor je bevestigt.

**Terugdraaien**
- *Direct uitzetten*: `COMMERCIAL_ENABLED` op `false` (of verwijderen) en opnieuw deployen. Menu, schermen en API's
  verdwijnen (404), de cron slaat over. De gegevens blijven in de database staan.
- *Eén persoon uitsluiten*: toegang intrekken in Beheer > Gebruikers en rechten; werkt direct.
- *Code terugdraaien*: een eerdere deployment promoten in Vercel. De nieuwe tabellen blijven bestaan en
  schaden de rest van de Hub niet.

## 7. Niet gebouwd en bekende beperkingen

- **Facturen**: de wettelijke factuurvereisten zijn niet gecontroleerd tegen de officiële bronnen van de
  Belastingdienst (die waren tijdens de bouw niet bereikbaar). Laat de pdf door de penningmeester of boekhouder
  nalopen vóór de eerste echte factuur. Het btw-tarief kies je zelf per regel; het systeem bepaalt geen
  vrijstellingen. Een bestaande rol "Financieel medewerker" in productie krijgt de nieuwe rechten
  `credit_notes:approve` en `credit_notes:send` niet automatisch; vink ze zo nodig aan.
- **Antwoorden op mailings registreren**: niet gebouwd (vraagt een inkomende mailbox).
- **Herinneringen** gaan naar de taakhouder en naar de eigenaar van het dossier; iedereen kiest zelf de
  frequentie in het profiel. De standaard voor wie niets koos staat onder Instellingen → **Herinneringsmail** (zonder
  instelling: dagelijks). Bij een lagere frequentie bevat de mail ook taken die vóór de volgende verzenddag vervallen.
- Vercel Blob wordt als openbaar type opslag gebruikt; de bescherming van bestanden berust op onraadbare sleutels
  en op het feit dat de URL nooit aan de browser wordt gegeven. Overweeg een privé-opslag voor vertrouwelijke contracten.
- Een mailing die halverwege crasht kan ontvangers in de status "bezig" achterlaten; die worden bewust niet
  automatisch opnieuw verstuurd om dubbele mails te voorkomen.
- Nieuwe tabellen met een `companyId` moeten worden opgenomen in het samenvoegen van dossiers (`mergeCompanies`).
- **Logo's**: een EPS zonder ingebouwd voorbeeld kan de Hub niet zelf tonen (daarvoor is een PostScript-programma nodig dat
  niet op Vercel draait); voeg dan los een voorbeeld toe. Bestanden zijn maximaal 4 MB. Logo's die vóór deze versie als PNG of
  JPG zijn geüpload, worden gewoon getoond; oudere bestanden krijgen niet achteraf een voorbeeld.
- **Meldingen** gaan alleen uit vanaf productie (`VERCEL_ENV=production`) en via Resend; een mislukte melding wordt
  vastgelegd maar niet automatisch opnieuw verstuurd, en houdt het activeren van het contract niet tegen.

## 8. Tests

`npm test` draait 66 tests. De integratietests vragen een Postgres via `TEST_DATABASE_URL` en worden anders
overgeslagen. Gedekt: rechtenmodel en delegatie, bereik (eigen/team/alles) en lekken via dubbelencontrole,
financiële zichtbaarheid (ook in totalen, export, audit en snapshots), versiecontrole, bestanden, import en
samenvoegen, contracten en verlengen, pijplijn, indexatie, rapportages en export (inclusief formule-injectie),
herinneringen (eenmalig, geen bedragen), mailings (afmelden, eenmalig versturen, foutherstel, webhook-handtekening
en idempotentie) en een bewaking dat elke commerciële API-route de centrale toegangscontrole gebruikt.
Ook gedekt: logo's (EPS met TIFF- of EPSI-voorbeeld, AI en PDF, SVG zonder scripts, los voorbeeld) en meldingen bij een nieuw contract (alleen beheerders wijzen aan, eenmalig per adres, nooit mailen buiten productie, geen bedragen).
Facturatie is gedekt (instellingen, nummering bij gelijktijdig uitgeven, onveranderlijkheid, creditnota's, betalingen, bereik, versturen met mislukte poging). Er is in geen enkele test echt gemaild.
