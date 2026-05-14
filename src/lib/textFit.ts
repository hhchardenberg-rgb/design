import { TemplateField, TextFitResult } from '../types/template'

// Fits text within a field, reducing font size if needed and breaking into lines
export function fitTextToField(
  text: string,
  field: TemplateField,
  canvasWidth: number
): TextFitResult {
  const maxFontSize = field.maxFontSize ?? 48
  const minFontSize = field.minFontSize ?? 12
  const lineHeight = field.lineHeight ?? 1.2

  // Scale dimensions based on canvas width (all templates use 1080 as base width)
  const scaleFactor = canvasWidth / 1080
  const scaledFieldWidth = field.width * scaleFactor
  const scaledFieldHeight = field.height * scaleFactor
  const scaledMaxFont = maxFontSize * scaleFactor
  const scaledMinFont = minFontSize * scaleFactor

  // Create a temporary canvas for measuring text
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { fontSize: scaledMaxFont, lines: [text] }
  }

  const fontFamily = field.fontFamily ?? 'Arial'
  const fontWeight = field.fontWeight ?? '400'

  // Try to fit text starting from max font size
  for (let fontSize = scaledMaxFont; fontSize >= scaledMinFont; fontSize -= 2) {
    const lines = breakTextIntoLines(
      text,
      ctx,
      fontSize,
      fontFamily,
      fontWeight,
      scaledFieldWidth
    )

    const totalHeight = lines.length * fontSize * lineHeight
    if (totalHeight <= scaledFieldHeight) {
      return { fontSize, lines }
    }
  }

  // Fallback: return minimum font size with broken lines
  const lines = breakTextIntoLines(
    text,
    ctx,
    scaledMinFont,
    fontFamily,
    fontWeight,
    scaledFieldWidth
  )
  return { fontSize: scaledMinFont, lines }
}

// Breaks text into lines that fit within a width
function breakTextIntoLines(
  text: string,
  ctx: CanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  maxWidth: number
): string[] {
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`

  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)

    if (metrics.width <= maxWidth) {
      currentLine = testLine
    } else {
      if (currentLine) {
        lines.push(currentLine)
      }
      currentLine = word

      // If single word is too long, add it anyway to prevent infinite loop
      if (!currentLine) {
        currentLine = word
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

// Calculate if text is too long and would need truncation
export function isTextTooLong(
  text: string,
  field: TemplateField,
  canvasWidth: number
): boolean {
  const result = fitTextToField(text, field, canvasWidth)
  const lineHeight = field.lineHeight ?? 1.2
  const scaleFactor = canvasWidth / 1080
  const scaledFieldHeight = field.height * scaleFactor
  const totalHeight = result.lines.length * result.fontSize * lineHeight

  return totalHeight > scaledFieldHeight || result.fontSize < (field.minFontSize ?? 12) * scaleFactor
}
