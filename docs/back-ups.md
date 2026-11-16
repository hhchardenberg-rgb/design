# Back-ups en herstel

De Hub maakt elke nacht (02:00 UTC, rond 03:00 Nederlandse tijd) een volledige, versleutelde back-up
van de database. Is er externe opslag (S3/R2) ingesteld, dan worden ook alle geüploade bestanden
gekopieerd. Beheer en historie: **Beheer > Back-ups** (alleen hoofdadmin). Code: `src/lib/backup`.

## Instellen (Vercel > Settings > Environment Variables, Production)

| Variabele | Waarde |
|---|---|
| `NEON_API_KEY` | Optioneel, alleen Production. Neon API-sleutel voor de wekelijkse controle van de Neon-herstelpunten. |
| `BACKUP_ENCRYPTION_KEY` | `openssl rand -base64 32`. **Bewaar deze ook in de wachtwoordkluis**: zonder sleutel is geen enkele back-up terug te zetten. |
| `DATA_ENCRYPTION_KEY` | `openssl rand -base64 32`, op Production **en** Preview. Versleutelt telefoonnummers, notities en sponsorbestanden in de database en opslag. **Ook in de wachtwoordkluis**: zonder deze sleutel zijn die velden en bestanden na een herstel onleesbaar. Nooit wijzigen zolang er versleutelde gegevens zijn. |
| `BACKUP_S3_BUCKET` | naam van de bucket (bv. `hhc-hub-backups`) |
| `BACKUP_S3_ENDPOINT` | bij Cloudflare R2: `https://<account-id>.eu.r2.cloudflarestorage.com` (leeg bij AWS) |
| `BACKUP_S3_REGION` | `auto` bij R2, anders de regio (bv. `eu-central-1`) |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | API-sleutel met alleen rechten op deze bucket |

Zonder `BACKUP_S3_*` gaan de databaseback-ups (versleuteld) naar de bestaande Vercel Blob-opslag,
onder `backups/`. Dat beschermt tegen fouten in de database, niet tegen het verlies van het
Vercel-account; de bestanden worden dan niet apart gekopieerd.

Aanrader bij de bucket: zet **Object Lock / versiebeheer** aan (bij R2: "bucket lock rules"), zodat
ook iemand met de sleutel back-ups niet direct kan wissen.

## Wat zit erin

- Alle tabellen, behalve tijdelijke beveiligingsgegevens (`login_attempts`, `password_reset_tokens`,
  `webauthn_challenges`) en de back-uphistorie zelf (`backup_runs`).
- Bestanden: alles in Blob behalve `exports/`, `batches/` (opnieuw te maken) en `backups/`. Bestanden
  die in de Hub verwijderd worden, blijven in de back-up staan.

Bewaartermijn databaseback-ups: alles van 14 dagen, daarna één per week (8 weken) en één per maand
(12 maanden). De nieuwste blijft altijd staan.

## Herstellen

Herstel altijd eerst in een **nieuwe, lege database**, nooit direct over de productiedatabase heen.

1. Download de gewenste back-up via Beheer > Back-ups (of uit de bucket, `db/JJJJ/MM/...hhcbak`).
2. Maak een lege database, bv. een nieuwe Neon-branch zonder data, en noteer de verbindings-URL.
3. Haal de code op van de commit die in de back-up staat (`npm run backup -- inspect` toont hem) en
   zet het schema klaar:
   ```bash
   export BACKUP_ENCRYPTION_KEY=...           # uit de wachtwoordkluis
   # DATA_ENCRYPTION_KEY hoort bij de omgeving die de herstelde database gebruikt (zelfde waarde als in productie)
   npm run backup -- inspect back-up.hhcbak    # controleert sleutel en volledigheid
   DATABASE_URL=<nieuwe-db> npx prisma db push
   npm run backup -- restore back-up.hhcbak --database-url <nieuwe-db>
   ```
   Het terugzetten gebeurt in één transactie: gaat er iets mis, dan blijft de database leeg.
4. Controleer de gegevens (bv. via een preview die naar de nieuwe database wijst) en zet daarna
   `DATABASE_URL` in Vercel om, of gebruik de herstelde branch als nieuwe hoofdbranch in Neon.
5. Bestanden terugzetten (alleen nodig als Blob-opslag kwijt is):
   ```bash
   export BACKUP_S3_BUCKET=... BACKUP_S3_ENDPOINT=... BACKUP_S3_ACCESS_KEY_ID=... BACKUP_S3_SECRET_ACCESS_KEY=...
   npm run backup -- restore-files --to-dir ./herstel-bestanden     # of: --to-blob (met BLOB_READ_WRITE_TOKEN)
   ```

Een leesbare kopie (bijvoorbeeld voor een inzageverzoek) maak je met
`npm run backup -- decrypt back-up.hhcbak uit.ndjson`. Dat bestand is onversleuteld: daarna veilig verwijderen.

**Eerste verdedigingslinie:** Neon bewaart zelf een tijdlijn waarmee je de database naar een
eerder moment kunt terugzetten (Neon Console > Branches > Restore). Op het gratis plan is dat alleen de
**laatste 6 uur**: het snelst voor "er ging net iets mis". Voor alles wat langer geleden is, zijn de
back-ups hier de (onafhankelijke) kopie.

## Aparte database voor previews

Elke preview krijgt een eigen Neon-branch `preview/<git-branch>` (kopie van productie op dat moment),
zodat testen en `prisma db push` in een preview de echte gegevens niet raken. De app schrijft in previews
niets versleuteld en verstuurt geen echte mail (zet eventueel `PREVIEW_MAIL_TO` om testmails naar één
adres te laten gaan).

Het gratis Neon-plan staat ongeveer 10 branches tegelijk toe. Zit dat vol, dan faalt een nieuwe preview
binnen een seconde met **"Resource provisioning failed"**. Daarom ruimt de GitHub Action
**Neon-opruiming** (`.github/workflows/neon-opruiming.yml`, script `scripts/neon-opruiming.mjs`) de
kopieën op:

- direct wanneer een pull request gesloten of gemerged wordt (de kopie van die branch);
- elke nacht om 03:17 UTC als vangnet (o.a. voor Dependabot, die geen geheimen krijgt);
- met de hand via GitHub > Actions > Neon-opruiming > Run workflow (standaard een proefrun).

Nooit verwijderd: de hoofdbranch, beschermde branches, branches die niet met `preview/` beginnen (zoals
een proefherstel), de preview van een open pull request en een preview jonger dan 24 uur zonder pull
request. Nodig: het repository-geheim `NEON_API_KEY` (GitHub > Settings > Secrets and variables >
Actions); een ander Neon-project kan via de variabele `NEON_PROJECT_ID`.

## Wekelijkse controle

Elke maandag om 06:00 UTC (07:00 of 08:00 Nederlandse tijd) controleert de Hub de back-ups
(`/api/cron/backup-check`) en mailt de uitkomst naar de hoofdadmins. Ook te starten en te bekijken via
**Beheer > Back-ups > Nu controleren**. De controle:

- kijkt of de instellingen kloppen en de laatste back-up niet ouder is dan 36 uur;
- noemt de nachten van de afgelopen week zonder geslaagde back-up;
- downloadt de nieuwste back-up, ontsleutelt hem en leest alle rijen (een proefopening, zonder iets
  terug te zetten) en vergelijkt het aantal rijen met wat er bij het maken is vastgelegd;
- meldt bewaarde back-ups die met een andere sleutel zijn gemaakt;
- telt hoeveel back-ups er bewaard zijn en vanaf welke datum;
- controleert bij Neon (als `NEON_API_KEY` ook in Vercel staat) of de hoofddatabase in orde is, hoeveel
  uur er terug te gaan is en of er nog ruimte is voor previews.

De uitkomst staat ook in de audit-log (actie "Back-upcontrole uitgevoerd").

## Herstel oefenen

Doe minstens twee keer per jaar een proefherstel in een lege Neon-branch (stap 1 t/m 3) en
verwijder die branch daarna. Een back-up die nooit is teruggezet, is geen zekerheid.
