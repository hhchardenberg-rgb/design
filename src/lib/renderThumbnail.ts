import { ThumbnailConfig } from '../types/template'

export interface ThumbnailData {
  backgroundImageUrl: string
  name: string
  quote: string
}

export async function renderThumbnail(
  template: ThumbnailConfig,
  data: ThumbnailData
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = template.canvasWidth
  canvas.height = template.canvasHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Fill with black background
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Load and draw background image
  await drawBackgroundImage(ctx, data.backgroundImageUrl, template.canvasWidth, template.canvasHeight)

  // Draw left orange sidebar
  drawLeftSidebar(ctx, template)

  // Draw right orange sidebar
  drawRightSidebar(ctx, template)

  // Draw name label
  drawNameLabel(ctx, template, data.name)

  // Draw opening quotation mark
  drawOpeningQuote(ctx, template)

  // Draw quote text with shadow
  drawQuoteText(ctx, template, data.quote)

  return canvas
}

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
      const imgRatio = img.width / img.height
      const canvasRatio = width / height

      let drawWidth = width
      let drawHeight = height

      if (imgRatio > canvasRatio) {
        drawWidth = height * imgRatio
      } else {
        drawHeight = width / imgRatio
      }

      const drawX = (width - drawWidth) / 2
      const drawY = (height - drawHeight) / 2

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
      resolve()
    }
    img.onerror = () => {
      resolve()
    }
    img.src = imageUrl
  })
}

function drawLeftSidebar(ctx: CanvasRenderingContext2D, template: ThumbnailConfig): void {
  // Draw solid bar
  ctx.fillStyle = template.sidebarColor
  ctx.fillRect(0, 0, template.sidebarWidth, template.canvasHeight)

  // Draw diagonal pattern
  drawDiagonalPattern(ctx, 0, 0, template.sidebarWidth, template.canvasHeight)
}

function drawRightSidebar(ctx: CanvasRenderingContext2D, template: ThumbnailConfig): void {
  const rightX = template.canvasWidth - 30

  // Draw solid bar
  ctx.fillStyle = template.sidebarColor
  ctx.fillRect(rightX, 0, 30, template.canvasHeight)

  // Draw diagonal pattern
  drawDiagonalPattern(ctx, rightX, 0, 30, template.canvasHeight)
}

function drawDiagonalPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  ctx.strokeStyle = 'rgba(204, 82, 0, 0.2)' // Darker orange with low opacity
  ctx.lineWidth = 1

  // Draw diagonal lines from top-left to bottom-right
  const spacing = 12
  for (let i = -height; i < width + height; i += spacing) {
    ctx.beginPath()
    ctx.moveTo(x + i, y)
    ctx.lineTo(x + i + height, y + height)
    ctx.stroke()
  }
}

function drawNameLabel(ctx: CanvasRenderingContext2D, template: ThumbnailConfig, name: string): void {
  const label = template.nameLabel

  // Draw black background rectangle
  ctx.fillStyle = label.backgroundColor
  ctx.fillRect(label.x, label.y, label.width, label.height)

  // Draw name text
  ctx.fillStyle = label.textColor
  ctx.font = `${label.fontWeight} ${label.fontSize}px "${label.fontFamily}"`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  const textX = label.x + label.paddingLeft
  const textY = label.y + label.height / 2

  ctx.fillText(name.toUpperCase(), textX, textY)
}

function drawOpeningQuote(ctx: CanvasRenderingContext2D, template: ThumbnailConfig): void {
  const quote = template.quote

  ctx.fillStyle = quote.textColor
  ctx.font = `${quote.fontWeight} ${quote.openingQuoteFontSize}px "${quote.fontFamily}"`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // Apply text shadow
  ctx.shadowColor = quote.shadowColor
  ctx.shadowOffsetX = quote.shadowOffsetX
  ctx.shadowOffsetY = quote.shadowOffsetY
  ctx.shadowBlur = quote.shadowBlur

  ctx.fillText("'", quote.openingQuoteX, quote.openingQuoteY)

  // Reset shadow
  ctx.shadowColor = 'transparent'
}

function drawQuoteText(ctx: CanvasRenderingContext2D, template: ThumbnailConfig, quoteText: string): void {
  const quote = template.quote

  ctx.fillStyle = quote.textColor
  ctx.font = `${quote.fontWeight} ${quote.fontSize}px "${quote.fontFamily}"`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // Apply text shadow
  ctx.shadowColor = quote.shadowColor
  ctx.shadowOffsetX = quote.shadowOffsetX
  ctx.shadowOffsetY = quote.shadowOffsetY
  ctx.shadowBlur = quote.shadowBlur

  // Split text into lines and measure
  const lines = wrapText(ctx, quoteText.toUpperCase(), quote.maxWidth)

  // Draw lines
  let currentY = quote.y
  const lineHeight = quote.fontSize * quote.lineHeight

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Add closing quote to the last line
    if (i === lines.length - 1) {
      line = line + "'"
    }

    ctx.fillText(line, quote.x, currentY)
    currentY += lineHeight
  }

  // Reset shadow
  ctx.shadowColor = 'transparent'
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

export async function exportThumbnailAsPNG(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
}
