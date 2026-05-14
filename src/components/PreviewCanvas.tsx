import React, { useEffect, useRef } from 'react'
import { TemplateConfig, Format } from '../types/template'
import { renderTemplate } from '../lib/renderTemplate'
import { getFormat } from '../templates'

interface PreviewCanvasProps {
  template: TemplateConfig
  format: Format
  fieldValues: Record<string, string>
  backgroundImageUrl?: string
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  template,
  format,
  fieldValues,
  backgroundImageUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const render = async () => {
      try {
        const canvas = await renderTemplate(
          template,
          format,
          fieldValues,
          backgroundImageUrl
        )

        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')
          if (ctx) {
            const sourceCanvas = canvas
            const sourceCtx = sourceCanvas.getContext('2d')
            if (sourceCtx) {
              const imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
              ctx.putImageData(imageData, 0, 0)
            }
          }
        }
      } catch (error) {
        console.error('Error rendering template:', error)
      }
    }

    render()
  }, [template, format, fieldValues, backgroundImageUrl])

  const formatConfig = getFormat(format)
  if (!formatConfig) return null

  // Calculate display size to fit in container while maintaining aspect ratio
  const maxWidth = 600
  const scale = Math.min(1, maxWidth / formatConfig.width)
  const displayWidth = formatConfig.width * scale
  const displayHeight = formatConfig.height * scale

  return (
    <div className="border-2 border-gray-300 rounded-lg p-4 bg-gray-50">
      <canvas
        ref={canvasRef}
        width={formatConfig.width}
        height={formatConfig.height}
        style={{
          width: displayWidth,
          height: displayHeight,
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      />
    </div>
  )
}
