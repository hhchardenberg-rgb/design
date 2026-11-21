# Rollen in de HHC Hub

Eén rollensysteem voor de hele Hub (Beheer > Gebruikers en rechten). Per onderdeel kies je voor een persoon
**één niveau**; elk niveau kan alles van het vorige. Waar nodig zet je er **losse taken** bij. Met meerdere
rollen tellen de rechten op. Rolnamen hebben altijd de vorm "Onderdeel – niveau".

| Onderdeel | Niveaus (kies er één) | Taken (los erbij) |
|---|---|---|
| Algemeen | Hoofdadmin (vast: alles) | |
| Communicatie | Medewerker · Beheerder | |
| Klantenservice | Basis (handleidingen) · Medewerker (+ klanten zoeken) · Teamleider (+ vervangen/blokkeren) · Beheerder | |
| Commerciële Zaken | Alleen lezen · Medewerker · Beheerder | Contracten · Financiën · Mailings |
| HHC Tickets | Alleen lezen · Medewerker (uitgeven) · Beheerder | Scanner · Scannercoördinator · Ontwerp · Financiële rapportages |

- De definities staan in `src/lib/access/presets.ts`. Standaardrollen zijn gewone rollen: een hoofdadmin kan ze
  aanpassen (label "aangepast", met "Standaard invullen" terug) of verwijderen; een verwijderde komt niet terug.
- Lukt het niet met de standaard, maak dan een **eigen rol** (tabblad Rollen); die staan apart.
- Wie wat mag toewijzen: de hoofdadmin alles; een beheerder van een onderdeel alleen gebruikersniveaus van dat
  onderdeel; een beheerder van Commerciële Zaken of Klantenservice alleen bevoegdheden die hij zelf heeft.
  Pure HHC Tickets-rollen en beheerders wijst de hoofdadmin aan.
- Tweestapsverificatie is verplicht voor beheerders, Commerciële Zaken en iedereen in HHC Tickets die meer mag
  dan scannen.

Overzetten (november 2026, eenmalig, `migrateToCompactRoles`): bestaande rollen zijn op herkomst omgezet naar de
standaardrollen (nieuwe naam en omschrijving). Rollen die iemand had, hielden exact hun rechten; ongebruikte
kregen de standaardrechten. Ongebruikte oude standaardrollen zonder plek (Sponsorcommissielid, CZ-basistoegang)
zijn verwijderd. Eigen rollen bleven ongemoeid. Alles staat in het logboek (`access.compacted`).
