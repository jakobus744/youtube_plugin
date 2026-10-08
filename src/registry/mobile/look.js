import { themes as ytThemes } from '../youtube/look.js'
import { hashTokenDecls } from '../../appliers/hashTokens.js'

// look fuer m.youtube.com
// die mobilseite nennt ihre farbvariablen nach einem hash (--t3e41d7b…), die namen wechseln mit jedem build
// daher werden sie zur laufzeit an ihrem wert erkannt und passend ueberschrieben

export const TOKEN_SCOPE = 'html:root:root'

export const LOOK_GROUPS = ['Farben', 'Kacheln', 'Allgemein']

export { normColor, discoverTokens } from '../../appliers/hashTokens.js'

const COLOR_ROLES = ['bg', 'raised', 'menu', 'text', 'textSecondary', 'accent']

export const colorControls = [
  {
    id: 'bg',
    label: 'Hintergrund',
    tokens: [],
    extra: (v) => `html, body, ytm-mobile-topbar-renderer, ytm-mobile-topbar-renderer header, ytm-app .page-container { background-color: ${v} !important; }
ytm-pivot-bar-renderer { background: color-mix(in srgb, ${v} 88%, transparent) !important; }`
  },
  { id: 'raised', label: 'Flächen & Karten', tokens: [] },
  { id: 'menu', label: 'Menüs & Dialoge', tokens: [], extra: (v) => `bottom-sheet-container .ytSpecBottomSheetLayoutHost, .ytmBottomSheetRendererContainer, ytm-menu-popup-renderer, #menu.menu-container .menu-content { background-color: ${v} !important; }` },
  { id: 'text', label: 'Text', tokens: [], extra: (v) => `ytm-app, .media-item-headline, ytm-app h1, ytm-app h2, ytm-app h3 { color: ${v} !important; }` },
  { id: 'textSecondary', label: 'Text gedimmt', tokens: [], extra: (v) => `.ytmBadgeAndBylineRendererItemByline, ytm-badge-and-byline-renderer { color: ${v} !important; }` },
  { id: 'accent', label: 'Akzent & Links', tokens: [] },
  {
    id: 'progress',
    label: 'Fortschrittsbalken',
    tokens: [],
    extra: (v) => `#movie_player .ytp-play-progress, #movie_player .ytp-swatch-background-color, ytm-thumbnail-overlay-resume-playback-renderer [style*="width"], [class*="ResumePlayback"] [style*="width"] { background: ${v} !important; }`
  }
]

// gleiche themes wie bei youtube
export const themes = ytThemes

export const controls = [
  {
    id: 'titleSize',
    label: 'Titelgröße',
    group: 'Kacheln',
    type: 'range',
    min: 11,
    max: 22,
    step: 1,
    unit: 'px',
    placeholder: 14,
    css: (v) => `.media-item-headline, .media-item-headline span { font-size: ${v}px !important; line-height: 1.3 !important; }`
  },
  {
    id: 'thumbSize',
    label: 'Vorschaubilder',
    group: 'Kacheln',
    type: 'select',
    options: [['', 'Groß (YouTube)'], ['compact', 'Kompakt (Liste)']],
    css: () => `ytm-video-with-context-renderer ytm-media-item { display: flex !important; gap: 10px !important; align-items: flex-start !important; }
ytm-video-with-context-renderer .media-item-thumbnail-container { width: 42% !important; flex: none !important; }
ytm-video-with-context-renderer .media-item-details { flex: 1 !important; min-width: 0 !important; margin-top: 0 !important; }
ytm-video-with-context-renderer .media-channel { display: none !important; }`
  },
  {
    id: 'radius',
    label: 'Ecken-Rundung',
    group: 'Kacheln',
    type: 'range',
    min: 0,
    max: 24,
    step: 1,
    unit: 'px',
    placeholder: 12,
    css: (v) => `ytm-thumbnail-cover, ytm-thumbnail-cover img, .video-thumbnail-img { border-radius: ${v}px !important; }`
  },
  {
    id: 'font',
    label: 'Schrift',
    group: 'Allgemein',
    type: 'select',
    options: [
      ['', 'YouTube (Roboto)'],
      ['system-ui, -apple-system, "Segoe UI", sans-serif', 'System'],
      ['Georgia, "Times New Roman", serif', 'Serif'],
      ['ui-monospace, "JetBrains Mono", Consolas, monospace', 'Monospace']
    ],
    css: (v) => `ytm-app, ytm-app *:not(svg):not(path):not(c3-icon) { font-family: ${v} !important; }`
  },
  {
    id: 'dimOpacity',
    label: 'Stärke von „Dimmen“',
    group: 'Allgemein',
    type: 'range',
    min: 5,
    max: 80,
    step: 5,
    unit: '%',
    placeholder: 30,
    css: (v) => `:root { --ytx-dim-opacity: ${v / 100}; }`
  }
]

export const controlById = Object.fromEntries([...controls, ...colorControls.map((c) => ({ ...c, type: 'color', group: 'Farben' }))].map((c) => [c.id, c]))

// erkannte hash variablen ueberschreiben, dazu die youtube tokens fuer ytx eigene elemente
export function extraCss(colors) {
  const decl = hashTokenDecls(colors, COLOR_ROLES)
  const map = { bg: 'base-background', raised: 'raised-background', menu: 'menu-background', text: 'text-primary', textSecondary: 'text-secondary', accent: 'call-to-action' }
  for (const [k, t] of Object.entries(map)) if (colors[k]) decl.push(`--yt-sys-color-baseline--${t}: ${colors[k]};`)
  return decl.length ? `html:root:root { ${decl.join(' ')} }` : ''
}
