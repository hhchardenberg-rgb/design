# HHC Hardenberg — Design Editor

Webapplicatie waarmee medewerkers en vrijwilligers van HHC Hardenberg, zonder
Photoshop- of designkennis, professionele clubafbeeldingen maken op basis van
vooraf door een designer ontworpen PSD-templates.

Het systeem is **template-driven**, geen vrije Canva-achtige editor: de
designer bepaalt het ontwerp (in Photoshop), de eindgebruiker vult alleen de
toegestane gegevens in via een eenvoudige wizard met live preview.

## Belangrijkste functionaliteit

- **PSD-importpipeline** (`src/lib/psd`): parseert een geüploade `.psd` met
  [`ag-psd`](https://github.com/Agamnentzar/ag-psd), herkent de
  laagnaamgevingsconventie (`TEXT:`, `IMAGE:`, `COLOR:`, `VISIBILITY:`,
  `STATIC:` — zie `/docs/psd-conventions` in de app) en zet dit om naar een
  genormaliseerd, met Zod gevalideerd template-schema. Niet-herkende lagen
  worden automatisch plat gerasterd tot de achtergrond.
- **Template builder** (`/admin/templates/[id]/builder`): de admin
  controleert en verfijnt de automatisch gedetecteerde velden (label, type,
  verplicht, standaardwaarde, validatie) en publiceert een versie.
  Templateversies blijven bewaard; bestaande ontwerpen blijven gekoppeld aan
  de versie waarmee ze gemaakt zijn.
- **Smart text fitting** (`src/lib/render/textFit.ts`): tekst verkleint
  automatisch stapsgewijs tot een minimum, met optioneel meerdere regels,
  nooit een afkapping tenzij expliciet toegestaan. Wordt door zowel de
  live preview als de server-render gebruikt, zodat het resultaat nooit
  verrast.
- **Live preview** (`src/components/editor/design-canvas.tsx`): een
  Konva-canvas in de browser die direct meebeweegt met wat de gebruiker
  typt/uploadt, zonder dat er server-side gerenderd hoeft te worden.
- **Server-side hoge-resolutie export** (`src/lib/render/serverRender.ts`):
  gebruikt [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) om het
  ontwerp op volledige templateresolutie te renderen naar PNG/JPG/WebP, met
  dezelfde text-fit- en croplogica als de preview.
- **Centrale clubdata**: clubs, teams, spelers, tegenstanders en wedstrijden,
  zodat één wedstrijd voor meerdere visuals (matchday, opstelling, uitslag,
  ...) hergebruikt kan worden en gegevens niet steeds opnieuw ingetypt hoeven
  te worden.
- **Storage-abstractie** (`src/lib/storage`): lokale schijf tijdens
  development, overschakelbaar naar S3/Cloudflare R2/Supabase Storage in
  productie via de `STORAGE_DRIVER`-omgevingsvariabele.
- **Rollen**: `USER` (templates gebruiken) en `ADMIN` (templates beheren,
  fonts/huisstijlkleuren/club­data beheren).

## Techstack

- Next.js (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma ORM
- Auth.js (NextAuth v5) met credentials-login en rollen
- Konva / react-konva voor de canvas-preview
- ag-psd voor PSD-parsing, @napi-rs/canvas + sharp voor rendering
- Zod voor schema-validatie

## Aan de slag (lokale ontwikkeling)

1. **Database**: zorg voor een lokale PostgreSQL-server en maak een database
   aan (bijv. `hhc_design`).
2. **Omgevingsvariabelen**: kopieer `.env.example` naar `.env` en vul in
   (vooral `DATABASE_URL` en `AUTH_SECRET` — genereer die laatste met
   `openssl rand -base64 32`).
3. **Installeren**:
   ```bash
   npm install
   ```
4. **Database migreren + seeden**:
   ```bash
   npm run db:push    # of: npm run db:migrate
   npm run db:seed
   ```
   Dit maakt een admin-account (zie `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
   in `.env`), een voorbeeldteam/-wedstrijd en een kant-en-klare "Matchday"
   template, zodat de app direct te proberen is zonder eerst zelf een PSD te
   hoeven importeren.
5. **Starten**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

### Productiebuild

```bash
npm run build
npm run start
```

Zet in productie (of achter een reverse proxy) ook `AUTH_TRUST_HOST="true"`,
en een correcte `NEXTAUTH_URL`.

### Database seeden op een host zonder shell (bijv. Vercel)

Op platforms zoals Vercel heb je geen terminal om `npm run db:seed` uit te
voeren. Zet daarom tijdelijk een `SEED_SECRET` (bijv. `openssl rand -hex 32`)
in de omgevingsvariabelen, deploy opnieuw, en roep dan eenmalig aan:

```bash
curl -X POST https://jouw-app.vercel.app/api/system/seed \
  -H "x-seed-secret: <SEED_SECRET>"
```

Dit draait exact dezelfde seed-logica (`src/lib/seed.ts`) als `npm run
db:seed`, maar dan binnen de Vercel-omgeving zelf, tegen de daar
geconfigureerde `DATABASE_URL` — je hoeft dus geen databasewachtwoord te
delen. Idempotent (veilig om vaker aan te roepen; bestaande accounts worden
nooit overschreven). Verwijder `SEED_SECRET` daarna weer uit de
omgevingsvariabelen om het endpoint weer dicht te zetten.

## Scripts

| Commando            | Omschrijving                                   |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Development server (Turbopack)                  |
| `npm run build`      | Productiebuild                                  |
| `npm run start`      | Productieserver starten                         |
| `npm run lint`       | ESLint                                          |
| `npm run db:push`    | Prisma-schema naar de database pushen           |
| `npm run db:migrate` | Prisma-migratie aanmaken/uitvoeren              |
| `npm run db:seed`    | Seed-data (admin-account, voorbeeldtemplate)    |
| `npm run db:studio`  | Prisma Studio (database-GUI)                    |

## Projectstructuur (belangrijkste mappen)

```
prisma/                 Datamodel + seed-script
src/app/(app)/           Ingelogde app (dashboard, templates, wizard, admin/*)
src/app/api/              API-routes (templates, designs, admin-CRUD, uploads)
src/components/editor/    Live preview-canvas (Konva) + gedeelde hooks
src/components/wizard/    Formuliervelden van de creatiewizard
src/lib/psd/              PSD-importpipeline (parsen, naamgevingsconventie, rasterizen)
src/lib/render/           Gedeelde render-engine (text-fit, image-fit, server-export)
src/lib/storage/          Storage-abstractie (lokaal / S3-compatibel)
src/lib/validations/      Zod-schema's (o.a. het genormaliseerde template-JSON-schema)
```

## Documentatie voor designers

De naamgevingsconventie voor PSD-lagen (`TEXT:`, `IMAGE:`, `COLOR:`,
`VISIBILITY:`, `STATIC:`) staat binnen de app op `/docs/psd-conventions`,
inclusief praktische tips voor het aanleveren van templates.
