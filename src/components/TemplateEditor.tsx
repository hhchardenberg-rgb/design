import React, { useState } from 'react'
import { templates, formats } from '../templates'
import { Format } from '../types/template'
import { FieldEditor } from './FieldEditor'
import { PreviewCanvas } from './PreviewCanvas'
import { ExportButtons } from './ExportButtons'

export const TemplateEditor: React.FC = () => {
  const [templateId, setTemplateId] = useState<string>('quote')
  const [format, setFormat] = useState<Format>('instagram-feed')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [backgroundImage, setBackgroundImage] = useState<string>('')

  const template = templates[templateId]
  if (!template) return null

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

  const allRequiredFieldsFilled = template.fields
    .filter((f) => f.required)
    .every((f) => fieldValues[f.id]?.trim())

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Social Media Image Generator
          </h1>
          <p className="text-gray-600">
            Maak snel professionele social media afbeeldingen met vaste templates
          </p>
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
                {Object.entries(templates).map(([id, tmpl]) => (
                  <option key={id} value={id}>
                    {tmpl.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-600 mt-2">{template.description}</p>
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
                <div className="mt-2">
                  <button
                    onClick={() => setBackgroundImage('')}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Verwijderen
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
                template={template}
                format={format}
                fieldValues={fieldValues}
                backgroundImageUrl={backgroundImage}
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
                template={template}
                format={format}
                fieldValues={fieldValues}
                backgroundImageUrl={backgroundImage}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
