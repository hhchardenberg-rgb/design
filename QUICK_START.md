# Quick Start - Social Media Image Generator

## Setup (2 minuten)

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Automatisch geopend op `http://localhost:5173`

## Basis workflow

1. **Kies template** - Dropdown linksboven
2. **Kies formaat** - Instagram/LinkedIn/Twitter
3. **Vul teksten in** - In de editor velden
4. **Upload achtergrond** (optioneel) - Afbeelding toevoegen
5. **Bekijk preview** - Rechterkant update realtime
6. **Export** - Klik PNG of JPG

## Template overzicht

| Template | Gebruik | Velden |
|----------|---------|--------|
| **Quote Post** | Citaten & inspiratie | Citaat, Auteur, Subtitel |
| **Breaking News** | Nieuws & alerts | Headline, Subtitel, Datum |
| **Announcement** | Events & mededelingen | Titel, Beschrijving, CTA, Footer |
| **Carousel Slide** | Instagram carousel | Titel, Inhoud, Highlight, Slide# |

## Test data

### Quote Post
```
Citaat: "Success is not final, failure is not fatal."
Auteur: Winston Churchill
Subtitel: Daily inspiration
```

### Breaking News
```
Headline: Major Discovery Announced
Subtitle: Scientists achieve breakthrough in renewable energy
Datum: Today
```

### Announcement
```
Titel: Summer Sale 2026
Beschrijving: Up to 50% off on selected items. Limited time offer!
CTA: Shop Now
Footer: Valid until June 30
```

### Carousel Slide
```
Titel: Tip #1
Inhoud: Start your day with hydration. Drink a glass of water first thing in the morning.
Highlight: Hydrate!
Slide nummer: 1/5
```

## Build for production

```bash
npm run build
# Output in dist/ folder
```

## Adding a new template

See `DEVELOPER_GUIDE.md` for detailed instructions.

Quick version:
1. Create `src/templates/yourtemplate.ts`
2. Add to exports in `src/templates/index.ts`
3. Run `npm run dev` to see it in dropdown

## Common issues

### "Text is getting too small"
→ Shorten your text or choose a longer format (Story instead of Feed)

### "Text is cut off"
→ Manually test in canvas (reload browser)

### "Export not downloading"
→ Check browser popup blocker

### "Images not appearing"
→ Use web-accessible URLs (CORS-friendly)

## Tips

- **Test with long text** - See how auto-sizing handles it
- **Preview all formats** - Text fitting may differ slightly
- **Use high-contrast colors** - Test on mobile to check readability
- **Export early & often** - See the actual exported result, not just preview
