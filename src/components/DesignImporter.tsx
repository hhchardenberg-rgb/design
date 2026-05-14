import React, { useState } from 'react'
import { analyzeDesignImage, DetectedElement, ImportedTemplate } from '../lib/psdImporter'
import { TemplateConfig, TemplateField } from '../types/template'

interface DesignImporterProps {
  onImportTemplate: (template: TemplateConfig) => void
  onCancel: () => void
}

export const DesignImporter: React.FC<DesignImporterProps> = ({
  onImportTemplate,
  onCancel,
}) => {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [analyzing, setAnalyzing] = useState(false)
  const [importedTemplate, setImportedTemplate] = useState<ImportedTemplate | null>(null)
  const [templateName, setTemplateName] = useState('Imported Template')
  const [elements, setElements] = useState<DetectedElement[]>([])

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const url = e.target?.result as string
      setImageUrl(url)
      setAnalyzing(true)

      try {
        const analyzed = await analyzeDesignImage(url)
        setImportedTemplate(analyzed)
        setElements(analyzed.detectedElements)
        setTemplateName(analyzed.name)
      } catch (error) {
        console.error('Error analyzing design:', error)
        alert('Could not analyze design image')
      } finally {
        setAnalyzing(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleGenerateTemplate = () => {
    if (!importedTemplate) return

    // Convert detected elements to template fields
    const fields: TemplateField[] = elements.map((elem) => ({
      id: elem.id,
      label: `Text Field ${elements.indexOf(elem) + 1}`,
      type: 'multiline',
      required: true,
      maxLength: 200,
      maxFontSize: Math.round(elem.fontSize || 48),
      minFontSize: 12,
      x: elem.bounds.x,
      y: elem.bounds.y,
      width: elem.bounds.width,
      height: elem.bounds.height,
      fontFamily: 'FF DIN',
      fontWeight: '600',
      color: elem.color || '#FFFFFF',
      textAlign: 'center',
      lineHeight: 1.2,
    }))

    const template: TemplateConfig = {
      id: 'imported-' + Date.now(),
      name: templateName,
      description: 'Imported from design',
      backgroundColor: importedTemplate.backgroundColor,
      backgroundImage: importedTemplate.backgroundImageUrl,
      fields,
      logo: {
        text: 'HHC',
        x: 900,
        y: 1000,
        fontSize: 14,
        color: '#FFFFFF',
      },
    }

    onImportTemplate(template)
  }

  const updateElement = (id: string, updates: Partial<DetectedElement>) => {
    setElements((prev) =>
      prev.map((elem) => (elem.id === id ? { ...elem, ...updates } : elem))
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-gray-900">Design Importer</h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!imageUrl ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                Upload your design (PNG, JPG, or screenshot)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                }}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border-2 border-dashed border-gray-300 p-6 rounded-lg"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {analyzing ? 'Analyzing design...' : 'Detected Elements'}
                </h3>

                {analyzing ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  </div>
                ) : elements.length === 0 ? (
                  <p className="text-gray-600">
                    No text areas detected. You can manually add fields below.
                  </p>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {elements.map((elem, idx) => (
                      <div
                        key={elem.id}
                        className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Label
                            </label>
                            <input
                              type="text"
                              value={`Text Field ${idx + 1}`}
                              disabled
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-gray-100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Font Size
                            </label>
                            <input
                              type="number"
                              value={elem.fontSize || 32}
                              onChange={(e) =>
                                updateElement(elem.id, {
                                  fontSize: parseInt(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              X Position
                            </label>
                            <input
                              type="number"
                              value={elem.bounds.x}
                              onChange={(e) =>
                                updateElement(elem.id, {
                                  bounds: {
                                    ...elem.bounds,
                                    x: parseInt(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Y Position
                            </label>
                            <input
                              type="number"
                              value={elem.bounds.y}
                              onChange={(e) =>
                                updateElement(elem.id, {
                                  bounds: {
                                    ...elem.bounds,
                                    y: parseInt(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Width
                            </label>
                            <input
                              type="number"
                              value={elem.bounds.width}
                              onChange={(e) =>
                                updateElement(elem.id, {
                                  bounds: {
                                    ...elem.bounds,
                                    width: parseInt(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Height
                            </label>
                            <input
                              type="number"
                              value={elem.bounds.height}
                              onChange={(e) =>
                                updateElement(elem.id, {
                                  bounds: {
                                    ...elem.bounds,
                                    height: parseInt(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Text Color
                            </label>
                            <input
                              type="color"
                              value={elem.color || '#FFFFFF'}
                              onChange={(e) =>
                                updateElement(elem.id, { color: e.target.value })
                              }
                              className="w-full h-10 border border-gray-300 rounded cursor-pointer"
                            />
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            setElements((prev) =>
                              prev.filter((e) => e.id !== elem.id)
                            )
                          }
                          className="mt-3 text-sm text-red-600 hover:text-red-700 font-semibold"
                        >
                          Remove Field
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => {
                    const newId = `field-${elements.length}`
                    setElements([
                      ...elements,
                      {
                        id: newId,
                        type: 'text',
                        bounds: { x: 60, y: 100 + elements.length * 100, width: 960, height: 80 },
                        fontSize: 32,
                        color: '#FFFFFF',
                        confidence: 0.5,
                      },
                    ])
                  }}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-semibold"
                >
                  + Add Field
                </button>
              </div>

              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateTemplate}
                  disabled={elements.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  Generate Template
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
