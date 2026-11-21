# Constante synchronisatie met Fullhouse

De Hub houdt een kopie bij van de Fullhouse-tickets (alleen lezen, barcode als hash, naam als initialen) om te
kunnen scannen, tellen en zoeken. Fullhouse blijft de bron. Deze kopie wordt op vier manieren vers gehouden:

| Hoe | Wanneer | Wat |
| --- | --- | --- |
| Geplande taak (GitHub Actions, `.github/workflows/fullhouse-sync.yml`) | Elke 5 minuten | Ronde: per wedstrijd in beeld alleen de wijzigingen; eens per uur ook nieuwe evenementen |
| Openen van dashboard, Fullhouse-pagina of Wedstrijddag live | Hooguit eens per 3 minuten, na het laden | Dezelfde ronde, op de achtergrond |
| Webhook van Fullhouse (`/api/webhooks/fullhouse`) | Direct bij aankoop of wijziging | Wijzigingen van die ene wedstrijd |
| Vercel-cron (`/api/cron/tickets`) | Elke nacht | Volledige ronde als vangnet, plus bewaartermijnen |

Daarnaast zoekt de scanner een onbekende barcode altijd live op bij Fullhouse, dus een kaart die vlak voor de
aftrap is gekocht komt ook zonder synchronisatie binnen.

## Waarom niet gewoon een Vercel-cron elke minuut?

Het Vercel-abonnement van de Hub (Hobby) staat cron maar één keer per dag toe, en ook dan niet op de minuut.
Een betaald abonnement (Pro) kan elke minuut; dan kan de geplande taak naar `vercel.json` verhuizen
(`{ "path": "/api/cron/fullhouse-sync", "schedule": "*/5 * * * *" }`). Zolang dat niet nodig is, geeft GitHub het
startsein. De repository is openbaar, dus GitHub Actions kost niets.

Kanttekeningen bij GitHub: een geplande taak kan bij drukte een paar minuten later starten, en GitHub zet geplande
taken uit in een repository waar 60 dagen niets is gebeurd (dan krijgt de eigenaar een mail; met één klik weer aan).
De extra rondes bij het openen van het dashboard en de nachtelijke ronde vangen dat op, en het dashboard waarschuwt.

Nog vaker (bijv. elke 2 of 3 minuten) kan met een gratis externe cron-dienst, zoals cron-job.org: laat die
`POST https://hub.hhc-hardenberg.nl/api/cron/fullhouse-sync` aanroepen met de header
`Authorization: Bearer <FULLHOUSE_SYNC_SECRET>`. De Hub laat hooguit één ronde per minuut toe en draait nooit dubbel,
dus GitHub en zo'n dienst kunnen naast elkaar blijven bestaan.

## Eenmalig instellen (eigenaar)

1. Maak een lange, willekeurige sleutel (bijv. in een wachtwoordmanager, minstens 32 tekens).
2. Vercel > project `design` > Settings > Environment Variables: `FULLHOUSE_SYNC_SECRET` = die sleutel, alleen
   Production. Daarna opnieuw deployen (of de volgende merge afwachten).
3. GitHub > repository > Settings > Secrets and variables > Actions > New repository secret:
   `FULLHOUSE_SYNC_SECRET` = dezelfde sleutel.
4. GitHub > Actions > "Fullhouse-synchronisatie" > Run workflow, om direct te testen. Groen = gelukt.
   Op de Fullhouse-pagina in de Hub staat daarna "Automatisch (gepland)" in de lijst.

Optioneel, voor direct bijwerken bij elke aankoop: vraag Fullhouse om een webhook naar
`https://hub.hhc-hardenberg.nl/api/webhooks/fullhouse` met de gebeurtenissen `ticket.created`, `ticket.updated`,
`transaction.complete` en `transaction.canceled`, en als sleutel (hmacKey) de waarde van `FULLHOUSE_WEBHOOK_SECRET`.
De Fullhouse-pagina toont wanneer de laatste webhook binnenkwam.

## Status en storingen

- Het dashboard van HHC Tickets en de Fullhouse-pagina tonen wanneer de laatste geslaagde synchronisatie was.
- Oranje: de laatste ronde ging deels mis, of de laatste geslaagde ronde is te lang geleden (20 minuten als de
  geplande taak draait, anders 26 uur).
- Rood: de laatste twee automatische rondes zijn mislukt. Het begin van een storing komt ook in het auditlog
  (herhalingen niet).
- "Nu synchroniseren" (recht `sync:manage`) start direct een ronde.
- Er draait nooit meer dan één ronde tegelijk; een ronde die na 5 minuten nog "bezig" staat, telt als mislukt.
- Automatische rondes zonder wijzigingen komen niet in het auditlog en niet in de lijst op de Fullhouse-pagina;
  ze worden na 2 dagen opgeruimd.

## Previews

Een preview gebruikt nooit de productie-API (testmodus), dus daar wordt niet automatisch gesynchroniseerd en
toont de status "Testmodus". De geplande taak roept alleen productie aan.
