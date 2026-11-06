# Back-ups en herstel

De Hub maakt elke nacht (02:00 UTC, rond 03:00 Nederlandse tijd) een volledige, versleutelde back-up
van de database. Is er externe opslag (S3/R2) ingesteld, dan worden ook alle geüploade bestanden
gekopieerd. Beheer en historie: **Beheer > Back-ups** (alleen hoofdadmin). Code: `src/lib/backup`.

## Instellen (Vercel > Settings > Environment Variables, Production)

| Variabele | Waarde |
|---|---|
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
eerder moment kunt terugzetten (Neon Console > Branches > Restore). Dat is het snelst voor "gisteren
is er iets misgegaan". De back-ups hier zijn de tweede, onafhankelijke kopie.

## Aparte database voor previews

Previews gebruiken nu dezelfde database als productie. Zet in Vercel > Storage > (Neon-database) >
Settings de optie **"Create database branch for deployment" → Preview** aan. Elke preview krijgt dan een
eigen Neon-branch (kopie van productie op dat moment), zodat testen en `prisma db push` in een preview de
echte gegevens niet meer raken. De app schrijft in previews sowieso niets versleuteld en verstuurt geen
echte mail (zet eventueel `PREVIEW_MAIL_TO` om testmails naar één adres te laten gaan).

## Herstel oefenen

Doe minstens twee keer per jaar een proefherstel in een lege Neon-branch (stap 1 t/m 3) en
verwijder die branch daarna. Een back-up die nooit is teruggezet, is geen zekerheid.
