# Social Media Image Generator

Een webtool voor het snel maken van professionele social media afbeeldingen op basis van vaste templates. Ontworpen voor redacties die visuele content snel en foutloos willen produceren.

## Features

✅ **4 kant-en-klare templates:**
- Quote Post (inspirerende citaten)
- Breaking News (nieuws & breaking stories)
- Aankondiging (events & announcements)
- Carousel Slide (voor Instagram carousels)

✅ **4 sociale media formaten:**
- Instagram Feed (1080x1080)
- Instagram Story (1080x1920)
- LinkedIn Post (1200x1200)
- Twitter/X Post (1600x900)

✅ **Automatische tekstoptimalisatie:**
- Tekst wordt automatisch kleiner geschaald als dit nodig is
- Waarschuwingen voor te lange teksten
- Netjes afbrekende tekstregels

✅ **Export mogelijkheden:**
- PNG export (lossless)
- JPG export (gecomprimeerd)

✅ **Flexibele achtergronden:**
- Vaste achtergrondkleuren per template
- Optioneel upload van custom afbeeldingen

## Installation & Setup

### 1. Dependencies installeren

```bash
npm install
```

### 2. Development server starten

```bash
npm run dev
```

De app opent automatisch op `http://localhost:5173`

### 3. Production build maken

```bash
npm run build
```

Output verschijnt in de `dist/` folder.

## Projectstructuur

```
src/
├── components/           # React componenten
│   ├── TemplateEditor.tsx      # Hoofdcomponent met UI
│   ├── PreviewCanvas.tsx        # Canvas rendering & preview
│   ├── FieldEditor.tsx          # Tekstveld input
│   └── ExportButtons.tsx        # Export buttons
├── templates/           # Template configuraties
│   ├── quote.ts               # Quote template definitie
│   ├── breaking.ts            # Breaking news template
│   ├── announcement.ts        # Announcement template
│   ├── carousel.ts            # Carousel template
│   └── index.ts               # Exports & format definitions
├── lib/                 # Utility functies
│   ├── textFit.ts             # Automatische tekst-fitting logica
│   └── renderTemplate.ts      # Canvas rendering & export
├── types/              # TypeScript type definitions
│   └── template.ts            # Type interfaces
├── App.tsx             # Root component
├── main.tsx            # Entry point
└── index.css           # Tailwind & globale styles
```

## Hoe een nieuw template toevoegen

### 1. Maak een nieuw template bestand

Voorbeeld: `src/templates/mytemplate.ts`

```typescript
import { TemplateConfig } from '../types/template'

export const myTemplate: TemplateConfig = {
  id: 'mytemplate',
  name: 'Mijn Template',
  description: 'Beschrijving van het template',
  backgroundColor: '#FFFFFF',
  fields: [
    {
      id: 'title',
      label: 'Titel',
      type: 'text',
      required: true,
      maxLength: 100,
      maxFontSize: 48,
      minFontSize: 24,
      x: 60,
      y: 100,
      width: 960,
      height: 80,
      fontFamily: 'Arial',
      fontWeight: '700',
      color: '#000000',
      textAlign: 'center',
    },
    // Meer velden...
  ],
  logo: {
    text: '© LOGO',
    x: 900,
    y: 1000,
    fontSize: 14,
    color: '#606060',
  },
}
```

### 2. Export in `src/templates/index.ts`

```typescript
import { myTemplate } from './mytemplate'

export const templates: Record<string, TemplateConfig> = {
  quote: quoteTemplate,
  breaking: breakingTemplate,
  announcement: announcementTemplate,
  carousel: carouselTemplate,
  mytemplate: myTemplate,  // Voeg toe
}
```

### 3. Template field parameters

| Parameter | Type | Omschrijving |
|-----------|------|-------------|
| `id` | string | Unieke identifier (gebruikt voor data) |
| `label` | string | Gebruiksvriendelijke label in de editor |
| `type` | 'text' \| 'multiline' | Invoertype |
| `required` | boolean | Verplicht veld? |
| `maxLength` | number | Max karakters |
| `maxFontSize` | number | Grootste fontsize (in pixels voor 1080px canvas) |
| `minFontSize` | number | Kleinste fontsize |
| `x`, `y` | number | Positie op canvas (voor 1080px base width) |
| `width`, `height` | number | Beschikbare ruimte (voor 1080px base) |
| `fontFamily` | string | Font (Arial, Georgia, etc) |
| `fontWeight` | string | Font gewicht ('400', '600', '700') |
| `color` | string | Hexadecimale kleur (#FFFFFF) |
| `textAlign` | 'left' \| 'center' \| 'right' | Text alignment |
| `lineHeight` | number | Regelafstand multiplier (1.2 = 120%) |

## Technische aanpak

### Canvas rendering
De app gebruikt HTML5 Canvas voor rendering omdat:
- Volledige controle over typography en layout
- Nauwkeurige font rendering
- Optimaal voor export naar PNG/JPG
- Betere performance dan SVG voor complexe layouts

### Automatische text fitting
Teksten worden automatisch op drie niveaus aangepast:
1. Regellengte - woorden breken op max-width
2. Regelafstand - regels vullen verticaal
3. Fontsize - wordt gereduceerd als tekst niet past

Dit gebeurt altijd tussen `minFontSize` en `maxFontSize`.

### Responsive scaling
Alle coördinaten en grootte-waarden zijn relatief aan 1080px canvas-breedte. Bij export naar ander formaat worden alles proportioneel geschaald.

## Voorbeelddata per template

### Quote Post
```
Citaat: "Alles wat je wilt bereiken in het leven begint met een droom."
Auteur: Marie Curie
Subtitel: Inspiratie voor vandaag
```

### Breaking News
```
Headline: Revolutionaire doorbraak in medische technologie
Subtitle: Wetenschappers bereiken mijlpaal na 10 jaar onderzoek
Datum: 14 mei 2026
```

### Announcement
```
Titel: Zomerfestival 2026
Beschrijving: Vier drie dagen lang de beste muziek, kunst en cultuur. 
Een onvergetelijke zomerervaring wacht op je!
Call-to-action: Tickets nu beschikbaar
Footer: zomerfestival.nl | 20-22 juni
```

### Carousel Slide
```
Titel: Tip #3
Inhoud: Hydratatie is essentieel. Drink minstens 8 glazen water per dag 
voor optimale gezondheid en energie.
Highlight: Drink water!
Slide nummer: 3/10
```

## Tips & Tricks

### Tekst die te lang is
- De app waarschuwt automatisch als tekst niet volledig past
- Verkort de tekst of kies een korter format
- Teste altijd met het langste mogelijke tekstscenario

### Achtergrondafbeeldingen
- Gebruik afbeeldingen in dezelfde verhouding als je gekozen format
- PNG's met transparantie werken ook
- Te grote afbeeldingen kunnen traag laden

### Kleuren aanpassen
- Hex-waarden gebruiken (#FFFFFF)
- RGB waarden: RGB omzetten naar hex (online converters beschikbaar)
- Test contrast voor leesbaarheid

### Logo aanpassen
- Logo is een tekststring in de template config
- Wijzig `template.logo.text` voor andere inhoud
- Pas `template.logo.color` aan voor andere kleur

## Toekomstige uitbreidingen

Mogelijke toevoegingen:
- [ ] Template editor UI (colors, fonts aanpassen zonder code)
- [ ] Afbeeldingsupload voor illustraties/foto's in velden
- [ ] Multi-language support
- [ ] Template library (meer templates uit de box)
- [ ] Batch export (meerdere variaties tegelijk)
- [ ] Cloud opslag van drafts
- [ ] Undo/redo functionaliteit

## Browser support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Lokale file API gebruikt voor export, dus desktop browsers aanbevolen.

## License

MIT - Vrij te gebruiken en aan te passen.