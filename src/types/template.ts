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
