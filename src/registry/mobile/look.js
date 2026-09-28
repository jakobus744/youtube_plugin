import { themes as ytThemes } from '../youtube/look.js'

// look fuer m.youtube.com
// die mobilseite nennt ihre farbvariablen nach einem hash (--t3e41d7b…), die namen wechseln mit jedem build
// daher werden sie zur laufzeit an ihrem wert erkannt und passend ueberschrieben

export const TOKEN_SCOPE = 'html:root:root'

export const LOOK_GROUPS = ['Farben', 'Kacheln', 'Allgemein']

// farbe in vergleichbare form: #rrggbb oder rgba(r,g,b,a)
export function normColor(v) {
  const s = String(v || '').trim().toLowerCase().replace(/\s+/g, '')
  let m = s.match(/^#([0-9a-f]{3})$/)
  if (m) return `#${[...m[1]].map((c) => c + c).join('')}`
  if (/^#[0-9a-f]{6}$/.test(s)) return s
  m = s.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/)
  if (!m) return null
  const hex = `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`
  const a = m[4] == null ? 1 : Number(m[4])
  return a >= 1 ? hex : `${hex}@${Math.round(a * 1000) / 1000}`
}

// vars: [[name, wert]], refs: rolle -> farbe der seite
// liefert rolle -> [{ name, alpha }], transparente varianten der grundfarbe werden mitgenommen
export function discoverTokens(vars, refs) {
  const out = {}
  const wanted = Object.entries(refs).map(([role, v]) => [role, normColor(v)]).filter(([, v]) => v)
  for (const [name, raw] of vars) {
    if (!/^--t[0-9a-f]{8,}$/.test(name)) continue
    const c = normColor(raw)
    if (!c) continue
    const [hex, alpha] = c.split('@')
    for (const [role, ref] of wanted) {
      if (ref === c || (role === 'bg' && alpha && ref === hex)) (out[role] ||= []).push({ name, alpha: alpha ? Number(alpha) : 1 })
    }
  }
  return out
}

let found = {}

export function setDiscovered(map) {
  found = map || {}
}

export function discovered() {
  return found
}

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
  { id: 'menu', label: 'Menüs & Dialoge', tokens: [], extra: (v) => `ytm-app bottom-sheet-container [class*="BottomSheet"], .ytmBottomSheetRendererContainer, ytm-menu-popup-renderer { background-color: ${v} !important; }` },
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
  const decl = []
  for (const role of COLOR_ROLES) {
    const v = colors[role]
    if (!v) continue
    for (const t of found[role] || []) decl.push(`${t.name}: ${t.alpha < 1 ? `color-mix(in srgb, ${v} ${Math.round(t.alpha * 100)}%, transparent)` : v} !important;`)
  }
  const map = { bg: 'base-background', raised: 'raised-background', menu: 'menu-background', text: 'text-primary', textSecondary: 'text-secondary', accent: 'call-to-action' }
  for (const [k, t] of Object.entries(map)) if (colors[k]) decl.push(`--yt-sys-color-baseline--${t}: ${colors[k]};`)
  return decl.length ? `html:root:root { ${decl.join(' ')} }` : ''
}
