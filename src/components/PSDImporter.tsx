import React, { useState } from 'react'
import { TemplateConfig, TemplateField } from '../types/template'

interface PSDImporterProps {
  onImportTemplate: (template: TemplateConfig) => void
  onCancel: () => void
}

type ImportStep = 'file' | 'preview' | 'fields' | 'confirm'

export const PSDImporter: React.FC<PSDImporterProps> = ({
  onImportTemplate,
  onCancel,
}) => {
  const [step, setStep] = useState<ImportStep>('file')
  const [previewImage, setPreviewImage] = useState<string>('')
  const [templateName, setTemplateName] = useState('')
  const [canvasWidth, setCanvasWidth] = useState(1080)
  const [canvasHeight, setCanvasHeight] = useState(1080)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [error, setError] = useState('')
  const [previewScale, setPreviewScale] = useState(1)

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.psd')) {
      setError('Alleen .psd bestanden zijn toegestaan')
      return
    }

    setError('')
    setTemplateName(file.name.replace('.psd', '').trim())

    // Show next step with instructions
    setStep('preview')
  }

  const handlePreviewUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setPreviewImage(url)

      // Detect image dimensions
      const img = new Image()
      img.onload = () => {
        setCanvasWidth(img.width)
        setCanvasHeight(img.height)
        setPreviewScale(Math.min(600 / img.width, 400 / img.height))
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }

  const handleAddField = () => {
    const newField: TemplateField = {
      id: `field-${Date.now()}`,
      label: `Text Layer ${fields.length + 1}`,
      type: 'multiline',
      required: fields.length === 0,
      maxLength: 500,
      maxFontSize: 48,
      minFontSize: 12,
      x: 60,
      y: 100 + fields.length * 100,
      width: canvasWidth - 120,
      height: 80,
      fontFamily: 'FF DIN',
      fontWeight: '600',
      color: '#FFFFFF',
      textAlign: 'left',
      lineHeight: 1.2,
    }
    setFields([...fields, newField])
    setStep('fields')
  }

  const handleUpdateField = (id: string, updates: Partial<TemplateField>) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  const handleRemoveField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id))
  }

  const handleGenerateTemplate = () => {
    if (!templateName || fields.length === 0) {
      setError('Geef template naam op en voeg minstens één veld toe')
      return
    }

    const template: TemplateConfig = {
      id: `psd-${Date.now()}`,
      name: templateName,
      description: `Template geïmporteerd van PSD`,
      backgroundColor: '#1a1a1a',
      backgroundImage: previewImage || undefined,
      backgroundOverlay: 0.2,
      fields,
      logo: {
        text: 'HHC',
        x: Math.max(canvasWidth - 100, 900),
        y: Math.max(canvasHeight - 80, 1000),
        fontSize: 14,
        color: '#FFFFFF',
      },
    }

    onImportTemplate(template)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-gray-900">PSD Design Importer</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>
          )}

          {/* Step 1: Upload PSD */}
          {step === 'file' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-4">
                  1️⃣ Upload je .psd bestand
                </label>
                <input
                  type="file"
                  accept=".psd"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                  }}
                  className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border-2 border-dashed border-gray-300 p-6 rounded-lg"
                />
              </div>

              <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
                <p className="font-semibold mb-2">💡 Hoe werkt het:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Upload je Photoshop (.psd) bestand</li>
                  <li>Upload een screenshot van hoe het eruit ziet (voor preview)</li>
                  <li>Definieer tekstlagen met hun posities</li>
                  <li>Template is klaar!</li>
                </ol>
              </div>
            </div>
          )}

          {/* Step 2: Upload Preview/Screenshot */}
          {step === 'preview' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  2️⃣ Upload een screenshot van je design
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  (Dit helpt je om tekstlagen exact te positioneren)
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePreviewUpload(file)
                  }}
                  className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border-2 border-dashed border-gray-300 p-6 rounded-lg"
                />
              </div>

              {previewImage && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Canvas afmetingen
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">Breedte</label>
                        <input
                          type="number"
                          value={canvasWidth}
                          onChange={(e) => setCanvasWidth(parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Hoogte</label>
                        <input
                          type="number"
                          value={canvasHeight}
                          onChange={(e) => setCanvasHeight(parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50 text-center">
                    <img
                      src={previewImage}
                      alt="Preview"
                      style={{
                        maxWidth: canvasWidth * previewScale,
                        maxHeight: canvasHeight * previewScale,
                      }}
                      className="mx-auto border border-gray-300 rounded"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setStep('fields')
                      if (fields.length === 0) {
                        handleAddField()
                      }
                    }}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
                  >
                    Volgende: Tekstlagen definieren →
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Define Fields */}
          {step === 'fields' && (
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    3️⃣ Tekstlagen ({fields.length})
                  </h3>
                  <button
                    onClick={handleAddField}
                    className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    + Laag toevoegen
                  </button>
                </div>

                {previewImage && (
                  <div className="mb-4 border-2 border-gray-200 rounded-lg p-3 bg-gray-50 text-center">
                    <img
                      src={previewImage}
                      alt="Preview"
                      style={{
                        maxWidth: canvasWidth * 0.4,
                        maxHeight: canvasHeight * 0.4,
                      }}
                      className="mx-auto border border-gray-300 rounded"
                    />
                  </div>
                )}

                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {fields.map((field) => (
                    <div
                      key={field.id}
                      className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                    >
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Label
                          </label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) =>
                              handleUpdateField(field.id, { label: e.target.value })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Verplicht
                          </label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) =>
                              handleUpdateField(field.id, { required: e.target.checked })
                            }
                            className="w-4 h-4 rounded"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            X
                          </label>
                          <input
                            type="number"
                            value={field.x}
                            onChange={(e) =>
                              handleUpdateField(field.id, { x: parseInt(e.target.value) })
                            }
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Y
                          </label>
                          <input
                            type="number"
                            value={field.y}
                            onChange={(e) =>
                              handleUpdateField(field.id, { y: parseInt(e.target.value) })
                            }
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            W
                          </label>
                          <input
                            type="number"
                            value={field.width}
                            onChange={(e) =>
                              handleUpdateField(field.id, { width: parseInt(e.target.value) })
                            }
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            H
                          </label>
                          <input
                            type="number"
                            value={field.height}
                            onChange={(e) =>
                              handleUpdateField(field.id, { height: parseInt(e.target.value) })
                            }
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Kleur
                          </label>
                          <input
                            type="color"
                            value={field.color || '#FFFFFF'}
                            onChange={(e) =>
                              handleUpdateField(field.id, { color: e.target.value })
                            }
                            className="w-full h-8 border border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Font Size
                          </label>
                          <input
                            type="number"
                            value={field.maxFontSize || 48}
                            onChange={(e) =>
                              handleUpdateField(field.id, {
                                maxFontSize: parseInt(e.target.value),
                              })
                            }
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveField(field.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-semibold"
                      >
                        🗑 Verwijderen
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setStep('preview')}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-semibold"
                >
                  ← Vorige
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
                >
                  Volgende: Bevestigen →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm & Import */}
          {step === 'confirm' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">4️⃣ Samenvatting</h3>

                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-600">Template naam</p>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mt-1"
                    />
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Canvas afmetingen</p>
                    <p className="font-semibold">
                      {canvasWidth} × {canvasHeight}px
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600">Tekstlagen</p>
                    <p className="font-semibold">{fields.length} lagen</p>
                    <ul className="text-sm text-gray-700 mt-2 space-y-1">
                      {fields.map((f) => (
                        <li key={f.id}>• {f.label}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setStep('fields')}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-semibold"
                >
                  ← Vorige
                </button>
                <button
                  onClick={handleGenerateTemplate}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold"
                >
                  ✓ Template Importeren
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

