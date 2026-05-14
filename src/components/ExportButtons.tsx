import React, { useState } from 'react'
import { TemplateConfig } from '../types/template'
import { renderTemplate } from '../lib/renderTemplate'
import { exportCanvasAsPNG, exportCanvasAsJPG } from '../lib/renderTemplate'

interface ExportButtonsProps {
  template: TemplateConfig
  format: string
  fieldValues: Record<string, string>
  backgroundImageUrl?: string
  backgroundOverlay?: number
  templateName: string
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  template,
  format,
  fieldValues,
  backgroundImageUrl,
  backgroundOverlay = 0,
  templateName,
}) => {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async (exportFormat: 'png' | 'jpg') => {
    setIsExporting(true)
    try {
      const templateWithOverlay: TemplateConfig = {
        ...template,
        backgroundOverlay,
      }
      const canvas = await renderTemplate(
        templateWithOverlay,
        format as any,
        fieldValues,
        backgroundImageUrl
      )

      const timestamp = new Date().toISOString().slice(0, 10)
      const filename = `${templateName}-${timestamp}.${exportFormat}`

      if (exportFormat === 'png') {
        await exportCanvasAsPNG(canvas, filename)
      } else {
        await exportCanvasAsJPG(canvas, filename, 0.95)
      }
    } catch (error) {
      console.error('Error exporting:', error)
      alert('Fout bij exporteren')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={() => handleExport('png')}
        disabled={isExporting}
        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-semibold"
      >
        {isExporting ? 'Exporteren...' : 'PNG Exporteren'}
      </button>
      <button
        onClick={() => handleExport('jpg')}
        disabled={isExporting}
        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-semibold"
      >
        {isExporting ? 'Exporteren...' : 'JPG Exporteren'}
      </button>
    </div>
  )
}
