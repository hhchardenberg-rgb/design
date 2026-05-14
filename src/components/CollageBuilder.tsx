import React, { useState, useRef } from 'react'
import { collageTemplates } from '../templates/collages'
import { CollageConfig } from '../types/template'
import { renderCollage } from '../lib/renderCollage'

interface PanelImage {
  dataUrl: string
  objectPosition: string
}

type CollageFormatId = keyof typeof collageTemplates

export const CollageBuilder: React.FC = () => {
  const [templateId, setTemplateId] = useState<CollageFormatId>('hhc-2-social')
  const [panelImages, setPanelImages] = useState<Record<string, PanelImage>>({})
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const template = collageTemplates[templateId]

  const handleImageUpload = (panelId: string, file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setPanelImages((prev) => ({
        ...prev,
        [panelId]: {
          dataUrl: e.target?.result as string,
          objectPosition: 'center',
        },
      }))
    }
    reader.readAsDataURL(file)
  }

  const handleObjectPositionChange = (panelId: string, position: string) => {
    setPanelImages((prev) => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        objectPosition: position,
      },
    }))
  }

  const exportCollage = async () => {
    if (!canvasRef.current) return

    try {
      const canvas = await renderCollage(template, panelImages)
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `collage-${templateId}-${Date.now()}.png`
      link.click()
    } catch (error) {
      console.error('Failed to export collage:', error)
      alert('Fout bij exporteren van collage')
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">HHC Collage Builder</h1>
          <p className="text-gray-600">Maak strakke collabes met oranje scheidingslijnen</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Template Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Template</h2>
              <select
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value as CollageFormatId)
                  setPanelImages({})
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(collageTemplates).map(([id, tmpl]) => (
                  <option key={id} value={id}>
                    {tmpl.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-600 mt-2">{template.description}</p>
            </div>

            {/* Image Uploads */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Afbeeldingen ({template.panelCount})
              </h2>
              <div className="space-y-4">
                {template.panels.map((panel, index) => (
                  <div key={panel.id} className="border border-gray-300 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Afbeelding {index + 1}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleImageUpload(panel.id, file)
                        }
                      }}
                      className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />

                    {panelImages[panel.id] && (
                      <div className="mt-3">
                        <label className="block text-xs font-semibold text-gray-700 mb-2">
                          Positie:
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {['top left', 'top center', 'top right', 'center left', 'center', 'center right', 'bottom left', 'bottom center', 'bottom right'].map(
                            (pos) => (
                              <button
                                key={pos}
                                onClick={() => handleObjectPositionChange(panel.id, pos)}
                                className={`px-2 py-1 text-xs rounded ${
                                  panelImages[panel.id]?.objectPosition === pos
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              >
                                {pos
                                  .split(' ')
                                  .map((w) => w.charAt(0).toUpperCase())
                                  .join('')}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Export */}
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={exportCollage}
                disabled={Object.keys(panelImages).length < template.panelCount}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                📥 Download Collage
              </button>
              {Object.keys(panelImages).length < template.panelCount && (
                <p className="text-xs text-red-600 mt-2">
                  Upload {template.panelCount - Object.keys(panelImages).length} meer afbeelding(en)
                </p>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
              <CollagePreview
                template={template}
                panelImages={panelImages}
                canvasRef={canvasRef}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface CollagePreviewProps {
  template: CollageConfig
  panelImages: Record<string, PanelImage>
  canvasRef: React.RefObject<HTMLCanvasElement>
}

const CollagePreview: React.FC<CollagePreviewProps> = ({ template, panelImages, canvasRef }) => {
  // Calculate preview dimensions to fit in 600px width max
  const maxWidth = 600
  const scale = Math.min(1, maxWidth / template.canvasWidth)
  const previewWidth = template.canvasWidth * scale
  const previewHeight = template.canvasHeight * scale

  return (
    <div className="flex flex-col items-center gap-4">
      {/* SVG Preview */}
      <svg
        width={previewWidth}
        height={previewHeight}
        className="border-2 border-gray-300 rounded-lg bg-gray-900"
        viewBox={`0 0 ${template.canvasWidth} ${template.canvasHeight}`}
      >
        {/* Image panels with clipping */}
        <defs>
          {template.panels.map((panel) => (
            <clipPath key={`clip-${panel.id}`} id={`clip-${panel.id}`}>
              {panel.clipPath && <path d={`M${panel.clipPath}Z`} />}
            </clipPath>
          ))}
        </defs>

        {/* Render image panels */}
        {template.panels.map((panel) => {
          const panelImage = panelImages[panel.id]
          return (
            <g key={panel.id} clipPath={`url(#clip-${panel.id})`}>
              {panelImage ? (
                <image
                  xlinkHref={panelImage.dataUrl}
                  x="0"
                  y="0"
                  width={template.canvasWidth}
                  height={template.canvasHeight}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <rect
                  x="0"
                  y="0"
                  width={template.canvasWidth}
                  height={template.canvasHeight}
                  fill="#333"
                />
              )}
            </g>
          )
        })}

        {/* Dividing lines */}
        {template.lineSegments.map((line, index) => {
          if (line.type === 'horizontal') {
            return (
              <line
                key={`line-${index}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={template.lineColor}
                strokeWidth={line.thickness}
                strokeLinecap="square"
              />
            )
          } else {
            return (
              <line
                key={`line-${index}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={template.lineColor}
                strokeWidth={line.thickness}
                strokeLinecap="square"
              />
            )
          }
        })}
      </svg>

      {/* Hidden Canvas for Export */}
      <canvas
        ref={canvasRef}
        width={template.canvasWidth}
        height={template.canvasHeight}
        style={{ display: 'none' }}
      />

      {/* Canvas Dimensions Info */}
      <div className="bg-gray-100 rounded-lg p-4 w-full">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Afmetingen:</span> {template.canvasWidth} × {template.canvasHeight}px
        </p>
      </div>
    </div>
  )
}
