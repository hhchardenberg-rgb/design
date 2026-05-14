import React, { useState } from 'react'
import { TemplateEditor } from './components/TemplateEditor'
import { CollageBuilder } from './components/CollageBuilder'

type Mode = 'editor' | 'collage'

export const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>('editor')

  return (
    <div>
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 flex gap-4">
          <button
            onClick={() => setMode('editor')}
            className={`px-4 py-4 font-semibold border-b-2 transition ${
              mode === 'editor'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            📝 Tekst
          </button>
          <button
            onClick={() => setMode('collage')}
            className={`px-4 py-4 font-semibold border-b-2 transition ${
              mode === 'collage'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            🖼️ Collage
          </button>
        </div>
      </div>
      {mode === 'editor' && <TemplateEditor />}
      {mode === 'collage' && <CollageBuilder />}
    </div>
  )
}
