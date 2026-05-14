import React from 'react'
import { TemplateField } from '../types/template'
import { isTextTooLong } from '../lib/textFit'
import { getFormat } from '../templates'

interface FieldEditorProps {
  field: TemplateField
  value: string
  onChange: (value: string) => void
  format: string
}

export const FieldEditor: React.FC<FieldEditorProps> = ({
  field,
  value,
  onChange,
  format,
}) => {
  const formatConfig = getFormat(format as any)
  const actualCanvasWidth = formatConfig?.width || 1080

  const isTooLong = isTextTooLong(value, field, actualCanvasWidth)

  const handleChange = (newValue: string) => {
    if (field.maxLength && newValue.length > field.maxLength) {
      return
    }
    onChange(newValue)
  }

  const characterCount = value.length
  const maxLength = field.maxLength || 500

  return (
    <div className={`mb-6 p-4 rounded-lg border-2 transition ${
      value ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-300'
    }`}>
      <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
        {value && <span className="text-green-500 mr-2">✓</span>}
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {field.type === 'text' ? (
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={field.maxLength}
          placeholder={`Voer ${field.label.toLowerCase()} in`}
          className={`w-full px-3 py-2 border-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 transition ${
            value ? 'border-green-400 bg-white' : 'border-gray-300 bg-gray-50'
          }`}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={field.maxLength}
          placeholder={`Voer ${field.label.toLowerCase()} in`}
          rows={4}
          className={`w-full px-3 py-2 border-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none transition ${
            value ? 'border-green-400 bg-white' : 'border-gray-300 bg-gray-50'
          }`}
        />
      )}

      <div className="mt-3 flex justify-between items-center">
        <div className="text-xs font-medium text-gray-600">
          {characterCount} / {maxLength} karakters
        </div>
        {isTooLong && (
          <div className="text-xs text-orange-600 font-semibold">
            ⚠ Tekst is te lang - zal automatisch kleiner worden
          </div>
        )}
      </div>
    </div>
  )
}
