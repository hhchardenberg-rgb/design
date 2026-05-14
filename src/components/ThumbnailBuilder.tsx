import React, { useState } from 'react'
import { thumbnailTemplate } from '../templates/thumbnail'
import { renderThumbnail, exportThumbnailAsPNG } from '../lib/renderThumbnail'

export const ThumbnailBuilder: React.FC = () => {
  const [backgroundImage, setBackgroundImage] = useState<string>('')
  const [name, setName] = useState<string>('RENÉ VAN DER WEIJ')
  const [quote, setQuote] = useState<string>('RESULTAAT STAAT\nBOVEN ALLES')

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setBackgroundImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleExport = async () => {
    if (!backgroundImage) {
      alert('Upload eerst een achtergrondfoto')
      return
    }
    if (!name.trim()) {
      alert('Vul de naam in')
      return
    }
    if (!quote.trim()) {
      alert('Vul de quote in')
      return
    }

    try {
      const canvas = await renderThumbnail(thumbnailTemplate, {
        backgroundImageUrl: backgroundImage,
        name: name.trim(),
        quote: quote.trim(),
      })
      await exportThumbnailAsPNG(canvas, `thumbnail-${Date.now()}.png`)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Fout bij exporteren')
    }
  }

  const maxWidth = 600
  const scale = Math.min(1, maxWidth / thumbnailTemplate.canvasWidth)
  const previewWidth = thumbnailTemplate.canvasWidth * scale
  const previewHeight = thumbnailTemplate.canvasHeight * scale

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">HHC Eyecons Thumbnail</h1>
          <p className="text-gray-600">Maak 1920x1080 video thumbnails met foto, naam en quote</p>
        </div>

        {/* Debug Panel */}
        <div className="bg-gray-900 text-white rounded-lg p-4 mb-8 font-mono text-sm">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">🖼️ Template</p>
              <p className="font-semibold text-blue-400">{thumbnailTemplate.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">📐 Afmetingen</p>
              <p className="font-semibold text-green-400">{thumbnailTemplate.canvasWidth}x{thumbnailTemplate.canvasHeight}px</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">📸 Achtergrond</p>
              <p className="font-semibold text-yellow-400">{backgroundImage ? '✓ Geüpload' : '✗ Niet geüpload'}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-gray-700 pt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Naam:</span>
              <span className={name ? 'text-green-400' : 'text-red-400'}>
                {name ? `"${name}"` : '(leeg)'}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Quote:</span>
              <span className={quote ? 'text-green-400' : 'text-red-400'}>
                {quote ? `"${quote.substring(0, 30)}..."` : '(leeg)'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Background Image */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Achtergrondfoto</h2>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleImageUpload(file)
                  }
                }}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {backgroundImage && (
                <button
                  onClick={() => setBackgroundImage('')}
                  className="mt-3 text-sm text-red-600 hover:text-red-700 font-semibold"
                >
                  🗑 Verwijderen
                </button>
              )}
            </div>

            {/* Name Input */}
            <div className={`bg-white rounded-lg shadow p-6 border-2 transition ${
              name ? 'bg-blue-50 border-blue-300' : 'border-gray-300'
            }`}>
              <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                {name && <span className="text-green-500 mr-2">✓</span>}
                Naam (Vet, zwart label)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Voer naam in (bijv. RENÉ VAN DER WEIJ)"
                maxLength={50}
                className={`w-full px-3 py-2 border-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 transition font-semibold ${
                  name ? 'border-green-400 bg-white' : 'border-gray-300 bg-gray-50'
                }`}
              />
              <p className="text-xs text-gray-600 mt-2">
                {name.length} / 50 karakters
              </p>
            </div>

            {/* Quote Input */}
            <div className={`bg-white rounded-lg shadow p-6 border-2 transition ${
              quote ? 'bg-blue-50 border-blue-300' : 'border-gray-300'
            }`}>
              <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                {quote && <span className="text-green-500 mr-2">✓</span>}
                Quote / Kop (Groot, wit)
              </label>
              <textarea
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                placeholder="Voer quote in (bijv. RESULTAAT STAAT&#10;BOVEN ALLES)"
                maxLength={200}
                rows={4}
                className={`w-full px-3 py-2 border-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 transition resize-none font-bold ${
                  quote ? 'border-green-400 bg-white' : 'border-gray-300 bg-gray-50'
                }`}
              />
              <p className="text-xs text-gray-600 mt-2">
                {quote.length} / 200 karakters (gebruik Enter voor regelbreuk)
              </p>
            </div>

            {/* Export Button */}
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={handleExport}
                disabled={!backgroundImage || !name.trim() || !quote.trim()}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed transition"
              >
                📥 Export PNG (1920x1080)
              </button>
              {(!backgroundImage || !name.trim() || !quote.trim()) && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠ Vul alle velden in voordat je exporteert
                </p>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
              <div className="flex flex-col items-center gap-4">
                <ThumbnailPreview
                  backgroundImage={backgroundImage}
                  name={name}
                  quote={quote}
                  width={previewWidth}
                  height={previewHeight}
                />
                <div className="bg-gray-100 rounded-lg p-4 w-full">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Export formaat:</span> {thumbnailTemplate.canvasWidth} × {thumbnailTemplate.canvasHeight}px
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ThumbnailPreviewProps {
  backgroundImage: string
  name: string
  quote: string
  width: number
  height: number
}

const ThumbnailPreview: React.FC<ThumbnailPreviewProps> = ({ backgroundImage, name, quote, width, height }) => {
  const template = thumbnailTemplate

  return (
    <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-black" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${template.canvasWidth} ${template.canvasHeight}`}
        className="w-full h-full"
      >
        {/* Background Image */}
        {backgroundImage && (
          <image
            xlinkHref={backgroundImage}
            x="0"
            y="0"
            width={template.canvasWidth}
            height={template.canvasHeight}
            preserveAspectRatio="xMidYMid slice"
          />
        )}

        {/* Left Orange Sidebar */}
        <rect x="0" y="0" width={template.sidebarWidth} height={template.canvasHeight} fill={template.sidebarColor} />

        {/* Right Orange Sidebar */}
        <rect
          x={template.canvasWidth - 30}
          y="0"
          width="30"
          height={template.canvasHeight}
          fill={template.sidebarColor}
        />

        {/* Name Label Background */}
        <rect
          x={template.nameLabel.x}
          y={template.nameLabel.y}
          width={template.nameLabel.width}
          height={template.nameLabel.height}
          fill={template.nameLabel.backgroundColor}
        />

        {/* Name Text */}
        <text
          x={template.nameLabel.x + template.nameLabel.paddingLeft}
          y={template.nameLabel.y + template.nameLabel.height / 2}
          fontFamily="FF DIN"
          fontSize={template.nameLabel.fontSize}
          fontWeight={template.nameLabel.fontWeight}
          fill={template.nameLabel.textColor}
          textAnchor="start"
          dominantBaseline="middle"
          style={{ userSelect: 'none' } as React.CSSProperties}
        >
          {name.toUpperCase()}
        </text>

        {/* Opening Quote */}
        <text
          x={template.quote.openingQuoteX}
          y={template.quote.openingQuoteY}
          fontFamily="FF DIN"
          fontSize={template.quote.openingQuoteFontSize}
          fontWeight={template.quote.fontWeight}
          fill={template.quote.textColor}
          textAnchor="start"
          dominantBaseline="hanging"
          style={{ filter: 'drop-shadow(5px 6px 4px rgba(0,0,0,0.6))', userSelect: 'none' } as React.CSSProperties}
        >
          '
        </text>

        {/* Quote Text (SVG text has limitations with wrapping, so show placeholder) */}
        <text
          x={template.quote.x}
          y={template.quote.y}
          fontFamily="FF DIN"
          fontSize={template.quote.fontSize}
          fontWeight={template.quote.fontWeight}
          fill={template.quote.textColor}
          textAnchor="start"
          dominantBaseline="hanging"
          style={{ filter: 'drop-shadow(5px 6px 4px rgba(0,0,0,0.6))', whiteSpace: 'pre', userSelect: 'none' } as React.CSSProperties}
        >
          {quote.toUpperCase()}
        </text>
      </svg>
    </div>
  )
}
