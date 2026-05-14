import { TemplateConfig, Format } from '../types/template'
import { fitTextToField } from './textFit'
import { getFormat } from '../templates'

// Renders template to a canvas, returns the canvas element
export async function renderTemplate(
  template: TemplateConfig,
  format: Format,
  fieldValues: Record<string, string>,
  backgroundImageUrl?: string
): Promise<HTMLCanvasElement> {
  const formatConfig = getFormat(format)
  if (!formatConfig) {
    throw new Error(`Unknown format: ${format}`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = formatConfig.width
  canvas.height = formatConfig.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Draw background
  if (backgroundImageUrl) {
    await drawBackgroundImage(ctx, backgroundImageUrl, canvas.width, canvas.height)
  } else if (template.backgroundColor) {
    ctx.fillStyle = template.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Draw fields
  for (const field of template.fields) {
    const value = fieldValues[field.id] || ''
    if (value) {
      drawField(ctx, field, value, canvas.width)
    }
  }

  // Draw logo if present
  if (template.logo) {
    const logoFont = `600 ${template.logo.fontSize * (canvas.width / 1080)}px Arial`
    ctx.font = logoFont
    ctx.fillStyle = template.logo.color
    ctx.textAlign = 'right'
    ctx.fillText(template.logo.text, template.logo.x * (canvas.width / 1080), template.logo.y * (canvas.width / 1080))
  }

  return canvas
}

// Helper: draw a single field with fitted text
function drawField(
  ctx: CanvasRenderingContext2D,
  field: any,
  text: string,
  canvasWidth: number
): void {
  const scaleFactor = canvasWidth / 1080

  const { fontSize, lines } = fitTextToField(
    text,
    field,
    canvasWidth
  )

  const fontFamily = field.fontFamily ?? 'Arial'
  const fontWeight = field.fontWeight ?? '400'
  const color = field.color ?? '#000000'
  const textAlign = field.textAlign ?? 'left'
  const lineHeight = field.lineHeight ?? 1.2

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.fillStyle = color
  ctx.textAlign = textAlign

  const scaledX = field.x * scaleFactor
  const scaledY = field.y * scaleFactor

  // Draw each line of text
  lines.forEach((line, index) => {
    const yOffset = index * fontSize * lineHeight
    ctx.fillText(line, scaledX, scaledY + yOffset + fontSize)
  })
}

// Helper: draw background image with proper scaling
async function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  imageUrl: string,
  width: number,
  height: number
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Draw image to cover entire canvas
      const imgRatio = img.width / img.height
      const canvasRatio = width / height

      let drawWidth = width
      let drawHeight = height
      let drawX = 0
      let drawY = 0

      if (imgRatio > canvasRatio) {
        drawWidth = height * imgRatio
        drawX = (width - drawWidth) / 2
      } else {
        drawHeight = width / imgRatio
        drawY = (height - drawHeight) / 2
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
      resolve()
    }
    img.onerror = () => {
      // If image fails to load, just skip it
      resolve()
    }
    img.src = imageUrl
  })
}

// Export canvas as PNG
export async function exportCanvasAsPNG(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
}

// Export canvas as JPG
export async function exportCanvasAsJPG(canvas: HTMLCanvasElement, filename: string, quality: number = 0.95): Promise<void> {
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/jpeg', quality)
  link.download = filename
  link.click()
}
