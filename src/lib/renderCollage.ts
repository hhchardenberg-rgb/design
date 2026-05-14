import { CollageConfig } from '../types/template'

interface PanelImage {
  dataUrl: string
  objectPosition: string
}

export async function renderCollage(
  template: CollageConfig,
  panelImages: Record<string, PanelImage>
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = template.canvasWidth
  canvas.height = template.canvasHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Fill with dark background
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Load and draw each panel image
  for (const panel of template.panels) {
    const panelImage = panelImages[panel.id]
    if (!panelImage) continue

    await drawPanelImage(ctx, panelImage, template, panel.id)
  }

  // Draw dividing lines on top
  ctx.strokeStyle = template.lineColor
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  for (const line of template.lineSegments) {
    ctx.lineWidth = line.thickness
    ctx.beginPath()
    ctx.moveTo(line.x1, line.y1)
    ctx.lineTo(line.x2, line.y2)
    ctx.stroke()
  }

  return canvas
}

async function drawPanelImage(
  ctx: CanvasRenderingContext2D,
  panelImage: PanelImage,
  template: CollageConfig,
  panelId: string
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Find the panel's clip path to determine bounds
      const panelIndex = template.panels.findIndex((p) => p.id === panelId)
      if (panelIndex < 0) {
        resolve()
        return
      }

      const panel = template.panels[panelIndex]
      if (!panel.clipPath) {
        resolve()
        return
      }

      // Calculate image dimensions with object-fit: cover
      const imgRatio = img.width / img.height
      const canvasRatio = template.canvasWidth / template.canvasHeight

      let drawWidth = template.canvasWidth
      let drawHeight = template.canvasHeight

      if (imgRatio > canvasRatio) {
        // Image is wider
        drawHeight = template.canvasHeight
        drawWidth = template.canvasHeight * imgRatio
      } else {
        // Image is taller
        drawWidth = template.canvasWidth
        drawHeight = template.canvasWidth / imgRatio
      }

      // Calculate position based on objectPosition
      let drawX = (template.canvasWidth - drawWidth) / 2
      let drawY = (template.canvasHeight - drawHeight) / 2

      const [verticalPos, horizontalPos] = panelImage.objectPosition.split(' ')

      if (verticalPos === 'top') drawY = 0
      else if (verticalPos === 'bottom') drawY = template.canvasHeight - drawHeight

      if (horizontalPos === 'left') drawX = 0
      else if (horizontalPos === 'right') drawX = template.canvasWidth - drawWidth

      // Save context state for clipping
      ctx.save()

      // Apply clip path using polygon
      applyClipPath(ctx, panel.clipPath)

      // Draw image with calculated position
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

      ctx.restore()

      resolve()
    }
    img.onerror = () => {
      resolve()
    }
    img.src = panelImage.dataUrl
  })
}

function applyClipPath(ctx: CanvasRenderingContext2D, clipPathString: string) {
  // Parse clip-path polygon(x1,y1 x2,y2 x3,y3 ...)
  const polygonMatch = clipPathString.match(/polygon\((.*?)\)/)
  if (!polygonMatch) return

  const points = polygonMatch[1].split(' ').map((point) => {
    const [x, y] = point.split(',').map((v) => parseFloat(v.trim()))
    return [x, y] as [number, number]
  })

  if (points.length < 3) return

  // Create clip path
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1])
  }
  ctx.closePath()
  ctx.clip()
}

export async function exportCollageAsPNG(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = filename
  link.click()
}
