import { quoteTemplate } from './quote'
import { breakingTemplate } from './breaking'
import { announcementTemplate } from './announcement'
import { carouselTemplate } from './carousel'
import { Format, FormatConfig, TemplateConfig } from '../types/template'

export const templates: Record<string, TemplateConfig> = {
  quote: quoteTemplate,
  breaking: breakingTemplate,
  announcement: announcementTemplate,
  carousel: carouselTemplate,
}

export const formats: Record<Format, FormatConfig> = {
  'instagram-feed': {
    width: 1080,
    height: 1080,
    name: 'Instagram Feed',
  },
  'instagram-story': {
    width: 1080,
    height: 1920,
    name: 'Instagram Story',
  },
  linkedin: {
    width: 1200,
    height: 1200,
    name: 'LinkedIn Post',
  },
  twitter: {
    width: 1600,
    height: 900,
    name: 'Twitter/X',
  },
}

export const getTemplate = (id: string): TemplateConfig | null => {
  return templates[id] || null
}

export const getFormat = (id: Format): FormatConfig | null => {
  return formats[id] || null
}
