# Zoektool in Klantenservice

Pagina: **Klantenservice > Klant of ticket zoeken** (`/klantenservice/zoeken`). Eén zoekveld dat tegelijk zoekt in het HHC-ticketsysteem en in Fullhouse.

## Wie mag het

- Klantenservice-rol (zoals elke pagina onder `/klantenservice`) **én** het HHC Tickets-recht `support:search` ("Klanten en tickets zoeken in Klantenservice"). De hoofdadmin heeft het automatisch.
- Nieuw rolsjabloon **Klantenservicemedewerker**: zoeken, ticketdetails bekijken en opnieuw versturen.
- E-mailadressen alleen voluit met `tickets:personal`; anders `j•••@domein.nl`.
- Werkt alleen als HHC Tickets aan staat (`TICKETS_ENABLED=true`).

## Waarop zoek je

| Invoer | HHC | Fullhouse (live, alleen lezen) |
|---|---|---|
| Naam (min. 3 letters) | voornaam, achternaam, bedrijf (elk woord) | `GET /api/tickets?name=` (naam van de tickethouder) |
| E-mailadres (volledig) | exact e-mailadres | `GET /api/customers?email=` → `GET /api/tickets?customerId=`; zonder klantrecord via `GET /api/transactions/rich?email=` → `/transactions/{id}/tickets` |
| Ticket- of kaartnummer | ticketkenmerk (of geplakte QR-tekst) | `GET /api/tickets?barcode=` |
| Ordernummer | CZ-referentie of bulkuitgifte-id | `GET /api/transactions/{id}` + `/tickets` |

"Automatisch" raadt de soort (met @ = e-mail, 24 hex-tekens = Fullhouse-order, code met cijfers = ticket, anders naam).

## Hoe actueel

- **HHC**: altijd actueel (eigen database).
- **Fullhouse**: live opgevraagd bij elke zoekopdracht met de API-sleutel. Er wordt niets van opgeslagen. Scanhistorie van Fullhouse-tickets komt van de HHC-scanners (via een hash van de barcode).
- Is Fullhouse niet bereikbaar en zoek je op barcode, dan toont de tool de eigen kopie van de laatste synchronisatie (alleen initialen, geen e-mail).
- Met alleen een scanapparaat-token (geen API-sleutel) kan Fullhouse alleen op barcode zoeken.
- Op previews en lokaal: testgegevens (Testbezoeker 1-50, `testbezoeker3@voorbeeld.nl`, `FH-TEST-0003`, `mock-order-2`).

## Privacy

- Zoekterm alleen in de body van een POST (`/api/klantenservice/zoeken`), nooit in een URL; antwoord `no-store`.
- Auditlog (HHC Tickets > Auditlog, actie "Klantenservice: klanten en tickets gezocht"): wie, wanneer, soort, gemaskeerde term en aantallen. Nooit de volledige term.
- Limiet: 30 zoekopdrachten per 5 minuten en 400 per dag per medewerker.
- Fullhouse-barcodes altijd gemaskeerd (laatste 4 tekens).

## Wat niet kan

- Fullhouse-tickets opnieuw versturen of wijzigen: dat zijn schrijfacties en die staan uit. Doe dat in het Fullhouse-dashboard.
- Echte Fullhouse-antwoorden zijn nog niet tegen het HHC-account gecontroleerd; de veldnamen volgen docs.vivenu.dev. Het name-filter van vivenu is niet gedocumenteerd als "bevat" of "exact".
