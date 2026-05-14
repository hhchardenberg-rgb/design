import React, { useState, useRef } from 'react'
import { collageTemplates } from '../templates/collages'
import { CollageConfig } from '../types/template'
import { renderCollage } from '../lib/renderCollage'

interface PanelImage {
  dataUrl: string
  objectPosition: string
  offsetX?: number
  offsetY?: number
  scale?: number
}

type CollageFormatId = keyof typeof collageTemplates

export const CollageBuilder: React.FC = () => {
  const [templateId, setTemplateId] = useState<CollageFormatId>('hhc-2-social')
  const [panelImages, setPanelImages] = useState<Record<string, PanelImage>>({})
  const [positioningPanelId, setPositioningPanelId] = useState<string | null>(null)
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

  const handleImagePositionChange = (panelId: string, offsetX: number, offsetY: number, scale: number) => {
    setPanelImages((prev) => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        offsetX,
        offsetY,
        scale,
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

  const currentPositioningImage = positioningPanelId ? panelImages[positioningPanelId] : null

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      {positioningPanelId && currentPositioningImage && (
        <CollageImagePositioner
          imageUrl={currentPositioningImage.dataUrl}
          offsetX={currentPositioningImage.offsetX ?? 0}
          offsetY={currentPositioningImage.offsetY ?? 0}
          scale={currentPositioningImage.scale ?? 1}
          onPositionChange={(offsetX, offsetY, scale) => {
            handleImagePositionChange(positioningPanelId, offsetX, offsetY, scale)
          }}
          onClose={() => setPositioningPanelId(null)}
        />
      )}

      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">HHC Collage Builder</h1>
          <p className="text-gray-600">Maak strakke collabes met oranje scheidingslijnen</p>
        </div>

        {/* Debug Panel */}
        <div className="bg-gray-900 text-white rounded-lg p-4 mb-8 font-mono text-sm">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">🖼️ Geselecteerde Template</p>
              <p className="font-semibold text-blue-400">{template.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">📐 Afmetingen</p>
              <p className="font-semibold text-green-400">{template.canvasWidth}×{template.canvasHeight}px</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">🖼️ Geüploade Afbeeldingen</p>
              <p className="font-semibold text-yellow-400">{Object.keys(panelImages).length} / {template.panelCount}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-400 mb-2">📋 Panel Status</p>
            <div className="space-y-1">
              {template.panels.map((panel, index) => {
                const img = panelImages[panel.id]
                return (
                  <div key={panel.id} className="flex justify-between text-xs">
                    <span className="text-gray-400">Panel {index + 1}:</span>
                    <span className={img ? 'text-green-400' : 'text-red-400'}>
                      {img ? `✓ Afbeelding (X:${img.offsetX ?? 0}px Y:${img.offsetY ?? 0}px Zoom:${Math.round((img.scale ?? 1) * 100)}%)` : '✗ Leeg'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
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
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">
                            Positie: X: {panelImages[panel.id]?.offsetX ?? 0}px, Y: {panelImages[panel.id]?.offsetY ?? 0}px, Zoom: {Math.round((panelImages[panel.id]?.scale ?? 1) * 100)}%
                          </p>
                          <button
                            onClick={() => setPositioningPanelId(panel.id)}
                            className="w-full px-3 py-2 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 font-semibold"
                          >
                            ↔️ Verplaatsen & Inzoomen
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-2">
                            Snelle positie:
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
          if (!panelImage) {
            return (
              <g key={panel.id} clipPath={`url(#clip-${panel.id})`}>
                <rect
                  x="0"
                  y="0"
                  width={template.canvasWidth}
                  height={template.canvasHeight}
                  fill="#333"
                />
              </g>
            )
          }

          const scale = panelImage.scale ?? 1
          const offsetX = panelImage.offsetX ?? 0
          const offsetY = panelImage.offsetY ?? 0

          return (
            <g key={panel.id} clipPath={`url(#clip-${panel.id})`}>
              <image
                xlinkHref={panelImage.dataUrl}
                x={offsetX}
                y={offsetY}
                width={template.canvasWidth * scale}
                height={template.canvasHeight * scale}
                preserveAspectRatio="xMidYMid slice"
              />
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

interface CollageImagePositionerProps {
  imageUrl: string
  offsetX: number
  offsetY: number
  scale: number
  onPositionChange: (offsetX: number, offsetY: number, scale: number) => void
  onClose: () => void
}

const CollageImagePositioner: React.FC<CollageImagePositionerProps> = ({
  imageUrl,
  offsetX,
  offsetY,
  scale,
  onPositionChange,
  onClose,
}) => {
  const [localOffsetX, setLocalOffsetX] = React.useState(offsetX)
  const [localOffsetY, setLocalOffsetY] = React.useState(offsetY)
  const [localScale, setLocalScale] = React.useState(scale)
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    redrawPreview()
  }, [localOffsetX, localOffsetY, localScale])

  const redrawPreview = () => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const imgRatio = img.width / img.height
      const canvasRatio = canvas.width / canvas.height

      let displayWidth = canvas.width
      let displayHeight = canvas.height

      if (imgRatio > canvasRatio) {
        displayWidth = canvas.height * imgRatio
      } else {
        displayHeight = canvas.width / imgRatio
      }

      displayWidth *= localScale
      displayHeight *= localScale

      ctx.drawImage(img, localOffsetX, localOffsetY, displayWidth, displayHeight)

      ctx.strokeStyle = '#FF6B35'
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, canvas.width, canvas.height)

      ctx.strokeStyle = 'rgba(255, 107, 53, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(canvas.width / 2 - 20, canvas.height / 2)
      ctx.lineTo(canvas.width / 2 + 20, canvas.height / 2)
      ctx.moveTo(canvas.width / 2, canvas.height / 2 - 20)
      ctx.lineTo(canvas.width / 2, canvas.height / 2 + 20)
      ctx.stroke()
    }
    img.src = imageUrl
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    setIsDragging(true)
    const rect = canvasRef.current.getBoundingClientRect()
    setDragStart({
      x: e.clientX - rect.left - localOffsetX,
      y: e.clientY - rect.top - localOffsetY,
    })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const newX = e.clientX - rect.left - dragStart.x
    const newY = e.clientY - rect.top - dragStart.y

    setLocalOffsetX(newX)
    setLocalOffsetY(newY)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleScaleChange = (newScale: number) => {
    setLocalScale(Math.max(0.5, Math.min(3, newScale)))
  }

  const handleApply = () => {
    onPositionChange(localOffsetX, localOffsetY, localScale)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Afbeelding Verplaatsen & Zoomen</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-semibold mb-2">💡 Hoe te gebruiken:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Sleep de afbeelding om deze te verplaatsen</li>
              <li>Gebruik zoom om in/uit te zoeken</li>
              <li>De rode box geeft het canvas aan</li>
            </ul>
          </div>

          <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-900">
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              className="w-full cursor-move"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                X Offset: {Math.round(localOffsetX)}px
              </label>
              <input
                type="range"
                min="-1000"
                max="1000"
                value={localOffsetX}
                onChange={(e) => setLocalOffsetX(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Y Offset: {Math.round(localOffsetY)}px
              </label>
              <input
                type="range"
                min="-1000"
                max="1000"
                value={localOffsetY}
                onChange={(e) => setLocalOffsetY(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Zoom: {Math.round(localScale * 100)}%
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleScaleChange(localScale - 0.1)}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-semibold"
              >
                −
              </button>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={localScale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <button
                onClick={() => handleScaleChange(localScale + 0.1)}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-semibold"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setLocalOffsetX(0)
                setLocalOffsetY(0)
                setLocalScale(1)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-semibold text-sm"
            >
              🔄 Reset
            </button>
          </div>

          <div className="flex gap-3 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-semibold"
            >
              Annuleren
            </button>
            <button
              onClick={handleApply}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
            >
              Toepassen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
