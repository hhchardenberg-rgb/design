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
    await drawBackgroundImage(ctx, backgroundImageUrl, canvas.width, canvas.height, template.backgroundPosition)
  } else if (template.backgroundColor) {
    ctx.fillStyle = template.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Draw background overlay (black fade)
  if (template.backgroundOverlay && template.backgroundOverlay > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${template.backgroundOverlay})`
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

// Helper: draw background image with proper scaling and positioning
async function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  imageUrl: string,
  width: number,
  height: number,
  position?: { offsetX: number; offsetY: number; scale: number }
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scaleFactor = width / 1080

      if (position && (position.offsetX !== 0 || position.offsetY !== 0 || position.scale !== 1)) {
        // Custom positioning: image should always fill canvas, positioned/cropped via offsets
        const imgRatio = img.width / img.height
        const canvasRatio = width / height

        // Calculate how large the image needs to be to cover the canvas
        let imgDisplayWidth = width
        let imgDisplayHeight = height

        if (imgRatio > canvasRatio) {
          // Image is wider: scale by height
          imgDisplayHeight = height
          imgDisplayWidth = height * imgRatio
        } else {
          // Image is taller: scale by width
          imgDisplayWidth = width
          imgDisplayHeight = width / imgRatio
        }

        // Apply user zoom
        imgDisplayWidth *= position.scale
        imgDisplayHeight *= position.scale

        // Apply user offsets (scale the offset to canvas resolution)
        const scaledOffsetX = position.offsetX * scaleFactor
        const scaledOffsetY = position.offsetY * scaleFactor

        // Draw the zoomed/positioned image
        ctx.drawImage(
          img,
          scaledOffsetX,
          scaledOffsetY,
          imgDisplayWidth,
          imgDisplayHeight
        )

        // Clip to canvas bounds if image extends beyond (for cropping effect)
        ctx.globalCompositeOperation = 'destination-in'
        ctx.fillStyle = 'rgba(0,0,0,1)'
        ctx.fillRect(0, 0, width, height)
        ctx.globalCompositeOperation = 'source-over'
      } else {
        // Default: center image to cover canvas
        const imgRatio = img.width / img.height
        const canvasRatio = width / height

        let drawWidth = width
        let drawHeight = height
        let drawX = 0
        let drawY = 0

        if (imgRatio > canvasRatio) {
          // Image wider than canvas
          drawWidth = height * imgRatio
          drawX = (width - drawWidth) / 2
        } else {
          // Image taller than canvas
          drawHeight = width / imgRatio
          drawY = (height - drawHeight) / 2
        }

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
      }

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
