import React, { useState } from 'react'
import { templates, formats } from '../templates'
import { Format, TemplateConfig, BackgroundPosition } from '../types/template'
import { FieldEditor } from './FieldEditor'
import { PreviewCanvas } from './PreviewCanvas'
import { ExportButtons } from './ExportButtons'
import { PSDImporter } from './PSDImporter'
import { ImagePositioner } from './ImagePositioner'

export const TemplateEditor: React.FC = () => {
  const [customTemplates, setCustomTemplates] = useState<Record<string, TemplateConfig>>({})
  const [templateId, setTemplateId] = useState<string>('quote')
  const [format, setFormat] = useState<Format>('instagram-feed')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [backgroundImage, setBackgroundImage] = useState<string>('')
  const [backgroundOverlay, setBackgroundOverlay] = useState<number>(0)
  const [backgroundPosition, setBackgroundPosition] = useState<BackgroundPosition>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  })
  const [showImporter, setShowImporter] = useState(false)
  const [showPositioner, setShowPositioner] = useState(false)

  const allTemplates = { ...templates, ...customTemplates }
  const template = allTemplates[templateId]
  const formatConfig = formats[format]
  if (!template || !formatConfig) return null

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }))
  }

  const handleBackgroundImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setBackgroundImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleImportTemplate = (newTemplate: TemplateConfig) => {
    setCustomTemplates((prev) => ({
      ...prev,
      [newTemplate.id]: newTemplate,
    }))
    setTemplateId(newTemplate.id)
    setFieldValues({})
    setBackgroundImage('')
    setShowImporter(false)
  }

  const allRequiredFieldsFilled = template.fields
    .filter((f) => f.required)
    .every((f) => fieldValues[f.id]?.trim())

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      {showImporter && (
        <PSDImporter
          onImportTemplate={handleImportTemplate}
          onCancel={() => setShowImporter(false)}
        />
      )}

      {showPositioner && backgroundImage && (
        <ImagePositioner
          imageUrl={backgroundImage}
          canvasWidth={formatConfig?.width || 1080}
          canvasHeight={formatConfig?.height || 1080}
          onPositionChange={(offsetX, offsetY, scale) => {
            setBackgroundPosition({ offsetX, offsetY, scale })
          }}
          onClose={() => setShowPositioner(false)}
        />
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Social Media Image Generator
          </h1>
          <p className="text-gray-600">
            Maak snel professionele social media afbeeldingen met vaste templates
          </p>
          <button
            onClick={() => setShowImporter(true)}
            className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-semibold text-sm"
          >
            📥 Design importeren
          </button>
        </div>

        {/* Debug Panel */}
        <div className="bg-gray-900 text-white rounded-lg p-4 mb-8 font-mono text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">📋 Geselecteerde Template</p>
              <p className="font-semibold text-blue-400">{template.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">📐 Format</p>
              <p className="font-semibold text-green-400">{formatConfig.name}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-400 mb-2">📝 Ingevulde Velden</p>
            <div className="space-y-1">
              {template.fields.length === 0 ? (
                <p className="text-gray-500">Geen velden in template</p>
              ) : (
                template.fields.map((field) => (
                  <div key={field.id} className="flex justify-between text-xs">
                    <span className="text-gray-400">{field.label}:</span>
                    <span className={fieldValues[field.id] ? 'text-yellow-400' : 'text-gray-600'}>
                      {fieldValues[field.id] ? `"${fieldValues[field.id].substring(0, 30)}${fieldValues[field.id].length > 30 ? '...' : ''}"` : '(leeg)'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-8">
            {/* Template Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Template</h2>
              <select
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value)
                  setFieldValues({})
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <optgroup label="Ingebouwde Templates">
                  {Object.entries(templates).map(([id, tmpl]) => (
                    <option key={id} value={id}>
                      {tmpl.name}
                    </option>
                  ))}
                </optgroup>
                {Object.keys(customTemplates).length > 0 && (
                  <optgroup label="Geïmporteerde Designs">
                    {Object.entries(customTemplates).map(([id, tmpl]) => (
                      <option key={id} value={id}>
                        {tmpl.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="text-sm text-gray-600 mt-2">{template.description}</p>
              {customTemplates[templateId] && (
                <button
                  onClick={() => {
                    setCustomTemplates((prev) => {
                      const next = { ...prev }
                      delete next[templateId]
                      setTemplateId('quote')
                      return next
                    })
                  }}
                  className="mt-2 text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  🗑 Template verwijderen
                </button>
              )}
            </div>

            {/* Format Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Formaat</h2>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(formats).map(([id, fmt]) => (
                  <option key={id} value={id}>
                    {fmt.name} ({fmt.width}x{fmt.height})
                  </option>
                ))}
              </select>
            </div>

            {/* Background Image Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Achtergrond (optioneel)
              </h2>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleBackgroundImageUpload(file)
                  }
                }}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {backgroundImage && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Zwart fade overlay: {Math.round(backgroundOverlay * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={backgroundOverlay}
                      onChange={(e) => setBackgroundOverlay(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-gray-700"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Voor betere leesbaarheid van tekst op foto's
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700 font-semibold mb-2">
                      📍 Huidige positie:
                    </p>
                    <p className="text-xs text-blue-600">
                      X: {backgroundPosition.offsetX}px | Y: {backgroundPosition.offsetY}px |
                      Zoom: {Math.round(backgroundPosition.scale * 100)}%
                    </p>
                  </div>

                  <button
                    onClick={() => setShowPositioner(true)}
                    className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-semibold text-sm"
                  >
                    ↔️ Positioneren & Croppen
                  </button>

                  <button
                    onClick={() => {
                      setBackgroundImage('')
                      setBackgroundOverlay(0)
                      setBackgroundPosition({ offsetX: 0, offsetY: 0, scale: 1 })
                    }}
                    className="text-sm text-red-600 hover:text-red-700 font-semibold"
                  >
                    🗑 Verwijderen
                  </button>
                </div>
              )}
            </div>

            {/* Fields */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tekstvelden</h2>
              <div className="space-y-4">
                {template.fields.map((field) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    value={fieldValues[field.id] || ''}
                    onChange={(value) => handleFieldChange(field.id, value)}
                    format={format}
                  />
                ))}
              </div>
            </div>

            {/* Export Buttons */}
            <div className="bg-white rounded-lg shadow p-6">
              <ExportButtons
                template={{
                  ...template,
                  backgroundPosition,
                }}
                format={format}
                fieldValues={fieldValues}
                backgroundImageUrl={backgroundImage}
                backgroundOverlay={backgroundOverlay}
                templateName={template.id}
              />
              {!allRequiredFieldsFilled && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠ Vul alle verplichte velden in voordat je exporteert
                </p>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
              <PreviewCanvas
                template={{
                  ...template,
                  backgroundPosition,
                }}
                format={format}
                fieldValues={fieldValues}
                backgroundImageUrl={backgroundImage}
                backgroundOverlay={backgroundOverlay}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
