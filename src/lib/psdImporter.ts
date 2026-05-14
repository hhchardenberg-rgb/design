// Analyzes a design image and extracts potential template structure
// This is a semi-automatic tool - user confirms detected elements

export interface DetectedElement {
  id: string
  type: 'text' | 'title' | 'logo' | 'background'
  bounds: { x: number; y: number; width: number; height: number }
  color?: string
  fontSize?: number
  content?: string
  confidence: number
}

export interface ImportedTemplate {
  name: string
  description: string
  backgroundColor: string
  backgroundImageUrl: string
  canvasWidth: number
  canvasHeight: number
  detectedElements: DetectedElement[]
}

// Analyze image canvas to detect text areas and colors
export async function analyzeDesignImage(
  imageUrl: string,
  targetWidth: number = 1080
): Promise<ImportedTemplate> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        resolve(createEmptyTemplate(imageUrl, targetWidth, img.width, img.height))
        return
      }

      ctx.drawImage(img, 0, 0)

      // Analyze canvas
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const dominantColor = extractDominantColor(imageData)
      const contrastAreas = detectContrastAreas(imageData)

      const template: ImportedTemplate = {
        name: 'Imported Design',
        description: 'Template imported from design image',
        backgroundColor: dominantColor,
        backgroundImageUrl: imageUrl,
        canvasWidth: targetWidth,
        canvasHeight: Math.round((targetWidth / img.width) * img.height),
        detectedElements: convertAreasToElements(contrastAreas, img.width, img.height),
      }

      resolve(template)
    }

    img.onerror = () => {
      resolve(createEmptyTemplate(imageUrl, targetWidth, 1080, 1080))
    }

    img.src = imageUrl
  })
}

// Extract dominant background color from image
function extractDominantColor(imageData: ImageData): string {
  const data = imageData.data
  const colorMap: Record<string, number> = {}
  let maxCount = 0
  let dominantColor = '#000000'

  // Sample every 10th pixel for performance
  for (let i = 0; i < data.length; i += 40) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const hex = rgbToHex(r, g, b)

    colorMap[hex] = (colorMap[hex] || 0) + 1
    if (colorMap[hex] > maxCount) {
      maxCount = colorMap[hex]
      dominantColor = hex
    }
  }

  return dominantColor
}

// Detect high-contrast areas (likely text regions)
function detectContrastAreas(imageData: ImageData): Array<{ x: number; y: number; width: number; height: number }> {
  const { width, height, data } = imageData
  const areas: Array<{ x: number; y: number; width: number; height: number }> = []

  // Simple grid-based detection
  const gridSize = 100
  const threshold = 30

  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      const contrast = calculateContrast(data, width, height, x, y, gridSize)
      if (contrast > threshold) {
        areas.push({
          x,
          y,
          width: Math.min(gridSize, width - x),
          height: Math.min(gridSize, height - y),
        })
      }
    }
  }

  // Merge nearby areas
  return mergeAreas(areas)
}

// Calculate contrast in a region
function calculateContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  size: number
): number {
  let minBrightness = 255
  let maxBrightness = 0

  for (let py = y; py < Math.min(y + size, height); py++) {
    for (let px = x; px < Math.min(x + size, width); px++) {
      const idx = (py * width + px) * 4
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      minBrightness = Math.min(minBrightness, brightness)
      maxBrightness = Math.max(maxBrightness, brightness)
    }
  }

  return maxBrightness - minBrightness
}

// Merge overlapping areas
function mergeAreas(areas: Array<{ x: number; y: number; width: number; height: number }>) {
  if (areas.length === 0) return []

  const merged: typeof areas = []
  const sorted = areas.sort((a, b) => a.y - b.y || a.x - b.x)

  let current = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]
    if (rectsOverlap(current, next)) {
      current = mergeRects(current, next)
    } else {
      merged.push(current)
      current = next
    }
  }

  merged.push(current)
  return merged
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

function mergeRects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: x2 - x, height: y2 - y }
}

// Convert detected areas to template elements
function convertAreasToElements(
  areas: Array<{ x: number; y: number; width: number; height: number }>,
  imgWidth: number,
  imgHeight: number
): DetectedElement[] {
  return areas
    .filter((area) => area.width > 20 && area.height > 20) // Ignore tiny areas
    .map((area, idx) => ({
      id: `field-${idx}`,
      type: 'text' as const,
      bounds: {
        x: Math.round((area.x / imgWidth) * 1080),
        y: Math.round((area.y / imgHeight) * 1080),
        width: Math.round((area.width / imgWidth) * 1080),
        height: Math.round((area.height / imgHeight) * 1080),
      },
      fontSize: Math.round(30 * (area.height / imgHeight)),
      color: '#FFFFFF',
      confidence: 0.7,
    }))
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function createEmptyTemplate(
  imageUrl: string,
  width: number,
  imgW: number,
  imgH: number
): ImportedTemplate {
  return {
    name: 'Imported Design',
    description: 'Template imported from design image',
    backgroundColor: '#000000',
    backgroundImageUrl: imageUrl,
    canvasWidth: width,
    canvasHeight: Math.round((width / imgW) * imgH),
    detectedElements: [],
  }
}
