export type Format = 'instagram-feed' | 'instagram-story' | 'linkedin' | 'twitter'

export interface FormatConfig {
  width: number
  height: number
  name: string
}

export interface TemplateField {
  id: string
  label: string
  type: 'text' | 'multiline'
  required: boolean
  maxLength?: number
  fontSize?: number
  maxFontSize?: number
  minFontSize?: number
  x: number
  y: number
  width: number
  height: number
  fontFamily?: string
  fontWeight?: string
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  lineHeight?: number
}

export interface BackgroundPosition {
  offsetX: number
  offsetY: number
  scale: number
}

export interface TemplateConfig {
  id: string
  name: string
  description: string
  backgroundColor?: string
  backgroundImage?: string
  backgroundPosition?: BackgroundPosition // Position/scale of background image
  backgroundOverlay?: number // 0-1, opacity of black overlay over background image
  fields: TemplateField[]
  logo?: {
    text: string
    x: number
    y: number
    fontSize: number
    color: string
  }
  borderRadius?: number
}

export interface EditorState {
  templateId: string
  format: Format
  fields: Record<string, string>
  backgroundImage?: string
}

export interface TextFitResult {
  fontSize: number
  lines: string[]
}

export interface CollagePanel {
  id: string
  clipPath?: string // CSS clip-path polygon for diagonal cuts
}

export interface CollageLineSegment {
  type: 'horizontal' | 'diagonal'
  x1: number
  y1: number
  x2: number
  y2: number
  thickness: number
}

export interface CollageConfig {
  id: string
  name: string
  description: string
  canvasWidth: number
  canvasHeight: number
  panelCount: number
  panels: CollagePanel[]
  lineSegments: CollageLineSegment[]
  lineColor: string // HHC orange: #ff6f00
}

export type CollageFormat = 'hhc-2-social' | 'hhc-2-website' | 'hhc-3-social' | 'hhc-3-website' | 'hhc-4-social' | 'hhc-4-website'
