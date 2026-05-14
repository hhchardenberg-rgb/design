import { CollageConfig } from '../types/template'

const HHC_ORANGE = '#ff6f00'

export const collageTemplates: Record<string, CollageConfig> = {
  'hhc-2-social': {
    id: 'hhc-2-social',
    name: 'HHC 2-Luik Social',
    description: '2 verticale foto\'s met schuine scheidingslijn (1080x1350)',
    canvasWidth: 1080,
    canvasHeight: 1350,
    panelCount: 2,
    panels: [
      {
        id: 'panel-1',
        clipPath: `polygon(0 0, ${640 + 14} 0, ${435 + 14} 1350, 0 1350)`,
      },
      {
        id: 'panel-2',
        clipPath: `polygon(${640 - 14} 0, 1080 0, 1080 1350, ${435 - 14} 1350)`,
      },
    ],
    lineSegments: [
      {
        type: 'diagonal',
        x1: 640,
        y1: 0,
        x2: 435,
        y2: 1350,
        thickness: 25,
      },
    ],
    lineColor: HHC_ORANGE,
  },

  'hhc-2-website': {
    id: 'hhc-2-website',
    name: 'HHC 2-Luik Website',
    description: '2 foto\'s naast elkaar (1220x800)',
    canvasWidth: 1220,
    canvasHeight: 800,
    panelCount: 2,
    panels: [
      {
        id: 'panel-1',
        clipPath: `polygon(0 0, ${660 + 13} 0, ${545 + 13} 800, 0 800)`,
      },
      {
        id: 'panel-2',
        clipPath: `polygon(${660 - 13} 0, 1220 0, 1220 800, ${545 - 13} 800)`,
      },
    ],
    lineSegments: [
      {
        type: 'diagonal',
        x1: 660,
        y1: 0,
        x2: 545,
        y2: 800,
        thickness: 24,
      },
    ],
    lineColor: HHC_ORANGE,
  },

  'hhc-3-social': {
    id: 'hhc-3-social',
    name: 'HHC 3-Luik Social',
    description: '3 verticale foto\'s met twee schuine lijnen (1080x1350)',
    canvasWidth: 1080,
    canvasHeight: 1350,
    panelCount: 3,
    panels: [
      {
        id: 'panel-1',
        clipPath: `polygon(0 0, ${405 + 14} 0, ${195 + 14} 1350, 0 1350)`,
      },
      {
        id: 'panel-2',
        clipPath: `polygon(${405 - 14} 0, ${835 + 14} 0, ${625 + 14} 1350, ${195 - 14} 1350)`,
      },
      {
        id: 'panel-3',
        clipPath: `polygon(${835 - 14} 0, 1080 0, 1080 1350, ${625 - 14} 1350)`,
      },
    ],
    lineSegments: [
      {
        type: 'diagonal',
        x1: 405,
        y1: 0,
        x2: 195,
        y2: 1350,
        thickness: 25,
      },
      {
        type: 'diagonal',
        x1: 835,
        y1: 0,
        x2: 625,
        y2: 1350,
        thickness: 25,
      },
    ],
    lineColor: HHC_ORANGE,
  },

  'hhc-3-website': {
    id: 'hhc-3-website',
    name: 'HHC 3-Luik Website',
    description: '3 foto\'s naast elkaar (1220x800)',
    canvasWidth: 1220,
    canvasHeight: 800,
    panelCount: 3,
    panels: [
      {
        id: 'panel-1',
        clipPath: `polygon(0 0, ${445 + 13} 0, ${315 + 13} 800, 0 800)`,
      },
      {
        id: 'panel-2',
        clipPath: `polygon(${445 - 13} 0, ${890 + 13} 0, ${760 + 13} 800, ${315 - 13} 800)`,
      },
      {
        id: 'panel-3',
        clipPath: `polygon(${890 - 13} 0, 1220 0, 1220 800, ${760 - 13} 800)`,
      },
    ],
    lineSegments: [
      {
        type: 'diagonal',
        x1: 445,
        y1: 0,
        x2: 315,
        y2: 800,
        thickness: 24,
      },
      {
        type: 'diagonal',
        x1: 890,
        y1: 0,
        x2: 760,
        y2: 800,
        thickness: 24,
      },
    ],
    lineColor: HHC_ORANGE,
  },

  'hhc-4-social': {
    id: 'hhc-4-social',
    name: 'HHC 4-Luik Social',
    description: '4 foto\'s in 2x2 grid (1080x1350)',
    canvasWidth: 1080,
    canvasHeight: 1350,
    panelCount: 4,
    panels: [
      {
        id: 'panel-1',
        clipPath: `polygon(0 0, ${630 + 14} 0, ${435 + 14} 675, 0 675)`,
      },
      {
        id: 'panel-2',
        clipPath: `polygon(${630 - 14} 0, 1080 0, 1080 675, ${435 - 14} 675)`,
      },
      {
        id: 'panel-3',
        clipPath: `polygon(0 ${675 - 11}, ${435 + 14} ${675 + 11}, 0 1350)`,
      },
      {
        id: 'panel-4',
        clipPath: `polygon(${630 - 14} ${675 - 11}, 1080 ${675 + 11}, 1080 1350, ${435 - 14} 1350)`,
      },
    ],
    lineSegments: [
      {
        type: 'horizontal',
        x1: 0,
        y1: 675,
        x2: 1080,
        y2: 675,
        thickness: 22,
      },
      {
        type: 'diagonal',
        x1: 630,
        y1: 0,
        x2: 435,
        y2: 1350,
        thickness: 25,
      },
    ],
    lineColor: HHC_ORANGE,
  },

  'hhc-4-website': {
    id: 'hhc-4-website',
    name: 'HHC 4-Luik Website',
    description: '4 verticale foto\'s (1220x800)',
    canvasWidth: 1220,
    canvasHeight: 800,
    panelCount: 4,
    panels: [
      {
        id: 'panel-1',
        clipPath: `polygon(0 0, ${315 + 13} 0, ${195 + 13} 800, 0 800)`,
      },
      {
        id: 'panel-2',
        clipPath: `polygon(${315 - 13} 0, ${655 + 13} 0, ${530 + 13} 800, ${195 - 13} 800)`,
      },
      {
        id: 'panel-3',
        clipPath: `polygon(${655 - 13} 0, ${990 + 13} 0, ${865 + 13} 800, ${530 - 13} 800)`,
      },
      {
        id: 'panel-4',
        clipPath: `polygon(${990 - 13} 0, 1220 0, 1220 800, ${865 - 13} 800)`,
      },
    ],
    lineSegments: [
      {
        type: 'diagonal',
        x1: 315,
        y1: 0,
        x2: 195,
        y2: 800,
        thickness: 24,
      },
      {
        type: 'diagonal',
        x1: 655,
        y1: 0,
        x2: 530,
        y2: 800,
        thickness: 24,
      },
      {
        type: 'diagonal',
        x1: 990,
        y1: 0,
        x2: 865,
        y2: 800,
        thickness: 24,
      },
    ],
    lineColor: HHC_ORANGE,
  },
}
