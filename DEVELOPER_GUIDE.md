# Developer Guide - Social Media Image Generator

Dit document beschrijft de interne architectuur en hoe je de tool uitbreidt.

## Architectuur Overview

### Lagenmodel

```
┌─────────────────────────────────────┐
│  React Components (UI Layer)        │ ← Gebruikersinteractie
├─────────────────────────────────────┤
│  Template System                    │ ← Template configuratie
├─────────────────────────────────────┤
│  Canvas Rendering                   │ ← Visual output
├─────────────────────────────────────┤
│  Export (PNG/JPG)                   │ ← File download
└─────────────────────────────────────┘
```

## Component hiërarchie

```
TemplateEditor (main)
├── Template Selector
├── Format Selector
├── Background Image Upload
├── FieldEditor[] (per template veld)
├── PreviewCanvas (live preview)
└── ExportButtons
    ├── PNG Export
    └── JPG Export
```

## Data flow

```
1. User selects template → State update
2. User fills fields → fieldValues state
3. Preview listens → renders realtime
4. Export → canvas → PNG/JPG download
```

## Template System

### Template definitie

Elke template (`src/templates/*.ts`) volgt deze structuur:

```typescript
export const templateName: TemplateConfig = {
  id: 'unique-id',                    // Used in selectors
  name: 'Display Name',               // UI label
  description: 'Short description',   // Tooltip
  backgroundColor: '#FFFFFF',         // Fallback background
  
  fields: [                           // Editable text areas
    {
      id: 'field-id',
      label: 'Field Label',
      type: 'text' | 'multiline',
      required: true,
      maxLength: 100,
      maxFontSize: 48,
      minFontSize: 24,
      x: 60,                          // X position (base: 1080px width)
      y: 100,                         // Y position
      width: 960,                     // Available width
      height: 80,                     // Available height
      fontFamily: 'Arial',
      fontWeight: '700',
      color: '#000000',
      textAlign: 'center',
      lineHeight: 1.2,
    },
    // More fields...
  ],
  
  logo: {                             // Optional branding
    text: '© LOGO',
    x: 900,
    y: 1000,
    fontSize: 14,
    color: '#606060',
  },
}
```

### Base dimensions

Alle coördinaten zijn relatief aan **1080px canvas breedte**. Bij export wordt alles automatisch geschaald:
- Instagram Feed: 1080x1080 (1:1 scale)
- Instagram Story: 1080x1920 (1:1.78 scale vertically)
- LinkedIn: 1200x1200 (1.11:1.11 scale)
- Twitter: 1600x900 (1.48:0.83 scale)

## Text Fitting Algorithm

Zie `src/lib/textFit.ts`:

### Proces

1. **Canvas measurement** - Gebruik browser canvas context om tekstbreedte te meten
2. **Line breaking** - Breek tekst af bij woorden (niet karakters)
3. **Font scaling** - Itereer van max naar min fontSize
4. **Validation** - Check of het alles past

### Pseudocode

```
for fontSize from maxFontSize down to minFontSize:
  lines = breakTextIntoLines(text, fontSize)
  totalHeight = lines.length * fontSize * lineHeight
  if totalHeight <= fieldHeight:
    return { fontSize, lines }
return fallback (minFontSize + lines)
```

### Waarom dit werkt

- Woorden breken netjes af (geen gebroken woorden)
- Font size scaling is progressief
- Altijd een valide output (worst case: minFontSize)

## Rendering pipeline

### renderTemplate() flow

```typescript
1. Create canvas (dimensions based on format)
2. Draw background (color or image)
3. For each field:
   - Get user text
   - fitTextToField() → { fontSize, lines }
   - Draw lines at calculated size
4. Draw logo
5. Return canvas
```

### Canvas context usage

```typescript
// Font setup
ctx.font = `${weight} ${size}px ${family}`

// Color
ctx.fillStyle = color

// Text alignment
ctx.textAlign = 'left' | 'center' | 'right'

// Drawing
ctx.fillText(text, x, y)
```

## Export mechanism

### PNG Export
```typescript
canvas.toDataURL('image/png')
→ Data URL → Download link → Browser download
```

### JPG Export
```typescript
canvas.toDataURL('image/jpeg', quality)
→ Data URL → Download link → Browser download
```

Quality default: 0.95 (goed balans tussen file size en visuele kwaliteit)

## Adding a new template

### Step 1: Create template file

```bash
touch src/templates/newtemplatehere.ts
```

```typescript
import { TemplateConfig } from '../types/template'

export const newTemplateHereTemplate: TemplateConfig = {
  id: 'newtemplatehere',
  name: 'My New Template',
  description: 'Description of what this template is for',
  backgroundColor: '#FFFFFF',
  fields: [
    // Define your fields here
  ],
}
```

### Step 2: Export in index.ts

```typescript
// src/templates/index.ts
import { newTemplateHereTemplate } from './newtemplatehere'

export const templates: Record<string, TemplateConfig> = {
  // ... existing templates
  newtemplatehere: newTemplateHereTemplate,
}
```

### Step 3: Test locally

```bash
npm run dev
```

Your template should appear in the template dropdown.

### Step 4: Test all formats

Check that your template works in all 4 formats:
- Instagram Feed (1080x1080)
- Instagram Story (1080x1920)
- LinkedIn (1200x1200)
- Twitter (1600x900)

Adjust field positions and sizes if text is cut off.

## Adding a new format

### In src/templates/index.ts

```typescript
export const formats: Record<Format, FormatConfig> = {
  'instagram-feed': { width: 1080, height: 1080, name: 'Instagram Feed' },
  'myformat': { width: 1200, height: 600, name: 'My Format' },
}
```

### Update the Format type

```typescript
// src/types/template.ts
export type Format = 'instagram-feed' | 'instagram-story' | 'linkedin' | 'twitter' | 'myformat'
```

Then all templates automatically support the new format.

## Common customizations

### Change template colors

```typescript
// In your template file
backgroundColor: '#3498DB',  // Change background
fields: [
  {
    color: '#FFFFFF',  // Change text color
  }
]
logo: {
  color: '#2C3E50',  // Change logo color
}
```

### Change fonts

System fonts only (no web font loading in v1):
- Arial (default)
- Helvetica
- Georgia
- Times New Roman
- Courier New
- Verdana

```typescript
fontFamily: 'Georgia',
```

### Change logo

```typescript
logo: {
  text: 'YOUR BRAND HERE',
  x: 900,
  y: 1000,
  fontSize: 16,
  color: '#FFFFFF',
}
```

## Debugging

### Enable logging

Edit `src/lib/renderTemplate.ts`:

```typescript
console.log('Rendering template:', template.id)
console.log('Field values:', fieldValues)
console.log('Canvas size:', formatConfig.width, 'x', formatConfig.height)
```

### Canvas inspection

In browser DevTools:
```javascript
// Get the rendered canvas
const canvas = document.querySelector('canvas')

// Inspect dimensions
console.log(canvas.width, canvas.height)

// Export for debugging
canvas.toDataURL() // Copy to Data URL Viewer
```

### Test text fitting

```typescript
// In textFit.ts, add logging
for (let fontSize = scaledMaxFont; fontSize >= scaledMinFont; fontSize -= 2) {
  console.log(`Trying fontSize: ${fontSize}`)
  const lines = breakTextIntoLines(...)
  console.log(`Lines: ${lines.length}, total height: ${totalHeight}`)
}
```

## Performance considerations

### Canvas size impact

Large formats (1600x900) create larger canvases. Export is typically fast (<500ms).

### Font measurement

Text fitting uses canvas context. Most browsers optimize this - no performance issues even with long text.

### Image backgrounds

Loading external images is async. Large images (>2MB) might be slow. Consider compression.

## Browser compatibility

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Unsupported:
- IE 11 (no Canvas support for modern code)
- Old mobile browsers

## TypeScript types

### TemplateConfig
- id: string (unique identifier)
- name: string (display name)
- description: string (tooltip)
- backgroundColor?: string (hex color)
- fields: TemplateField[] (editable areas)
- logo?: LogoConfig (branding)
- borderRadius?: number (future use)

### TemplateField
- id: string (unique per template)
- label: string (UI label)
- type: 'text' | 'multiline'
- required: boolean
- maxLength?: number
- maxFontSize, minFontSize: number
- x, y, width, height: number (positions)
- fontFamily, fontWeight: string
- color: string (hex)
- textAlign: 'left' | 'center' | 'right'
- lineHeight?: number

## Testing checklist

When adding a new template or format:

- [ ] Template loads in dropdown
- [ ] All fields appear in editor
- [ ] Preview renders correctly
- [ ] Text fits in all field sizes
- [ ] Long text triggers font reduction
- [ ] Character count displays
- [ ] Export PNG works
- [ ] Export JPG works
- [ ] Different formats scale correctly
- [ ] Logo appears
- [ ] Background color shows (if no image)
- [ ] No console errors

## Possible enhancements

- [ ] Gradient backgrounds
- [ ] Image uploads per field
- [ ] Custom font loading
- [ ] Text shadows/outlines
- [ ] Template variations (dark mode, etc)
- [ ] Batch export
- [ ] Undo/redo
- [ ] Template library/sharing
