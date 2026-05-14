import React, { useState, useRef, useEffect } from 'react'

interface ImagePositionerProps {
  imageUrl: string
  canvasWidth: number
  canvasHeight: number
  onPositionChange: (offsetX: number, offsetY: number, scale: number) => void
  onClose: () => void
}

export const ImagePositioner: React.FC<ImagePositionerProps> = ({
  imageUrl,
  canvasWidth,
  canvasHeight,
  onPositionChange,
  onClose,
}) => {
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    redrawPreview()
  }, [offsetX, offsetY, scale])

  const redrawPreview = () => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw image with current positioning - image always fills canvas
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const imgRatio = img.width / img.height
      const canvasRatio = canvas.width / canvas.height

      // Calculate how large image needs to be to fill canvas
      let displayWidth = canvas.width
      let displayHeight = canvas.height

      if (imgRatio > canvasRatio) {
        displayWidth = canvas.height * imgRatio
      } else {
        displayHeight = canvas.width / imgRatio
      }

      // Apply zoom
      displayWidth *= scale
      displayHeight *= scale

      // Apply offset and draw
      ctx.drawImage(img, offsetX, offsetY, displayWidth, displayHeight)

      // Draw canvas bounds (safe area)
      ctx.strokeStyle = '#FF6B35'
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, canvas.width, canvas.height)

      // Draw crosshair in center
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
      x: e.clientX - rect.left - offsetX,
      y: e.clientY - rect.top - offsetY,
    })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const newX = e.clientX - rect.left - dragStart.x
    const newY = e.clientY - rect.top - dragStart.y

    setOffsetX(newX)
    setOffsetY(newY)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleScaleChange = (newScale: number) => {
    setScale(Math.max(0.5, Math.min(3, newScale)))
  }

  const handleApply = () => {
    onPositionChange(offsetX, offsetY, scale)
    onClose()
  }


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Achtergrond Positionering</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Instructions */}
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-semibold mb-2">💡 Hoe te gebruiken:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Sleep de afbeelding om deze te verplaatsen</li>
              <li>Gebruik zoom om in/uit te zoeken</li>
              <li>De rode box geeft het canvas aan</li>
            </ul>
          </div>

          {/* Canvas Preview */}
          <div ref={containerRef} className="border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-900">
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

          {/* Canvas Dimensions Info */}
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Canvas afmetingen:</span> {canvasWidth} × {canvasHeight}px
            </p>
          </div>

          {/* Position Controls */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                X Offset: {Math.round(offsetX)}px
              </label>
              <input
                type="range"
                min="-1000"
                max="1000"
                value={offsetX}
                onChange={(e) => setOffsetX(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Y Offset: {Math.round(offsetY)}px
              </label>
              <input
                type="range"
                min="-1000"
                max="1000"
                value={offsetY}
                onChange={(e) => setOffsetY(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          {/* Scale/Zoom Control */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Zoom: {Math.round(scale * 100)}%
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleScaleChange(scale - 0.1)}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-semibold"
              >
                −
              </button>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={scale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <button
                onClick={() => handleScaleChange(scale + 0.1)}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-semibold"
              >
                +
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Bereik: 50% - 300%
            </p>
          </div>

          {/* Preset Buttons -->
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setOffsetX(0)
                setOffsetY(0)
                setScale(1)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-semibold text-sm"
            >
              🔄 Reset
            </button>
            <button
              onClick={() => {
                setOffsetX(-150)
                setOffsetY(-150)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              ↖ Top-left
            </button>
            <button
              onClick={() => {
                setOffsetX(0)
                setOffsetY(-150)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              ⬆ Top
            </button>
            <button
              onClick={() => {
                setOffsetX(150)
                setOffsetY(-150)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              ↗ Top-right
            </button>
            <button
              onClick={() => {
                setOffsetX(-150)
                setOffsetY(0)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              ⬅ Left
            </button>
            <button
              onClick={() => {
                setOffsetX(0)
                setOffsetY(0)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold text-sm"
            >
              ◉ Center
            </button>
            <button
              onClick={() => {
                setOffsetX(150)
                setOffsetY(0)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              ➡ Right
            </button>
          </div>

          {/* Action Buttons */}
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
