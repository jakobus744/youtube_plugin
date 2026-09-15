// look einstellungen fuer music
// gleiche control ids wie bei youtube wo es passt, damit themes geteilt wirken

const T = (name) => `--ytmusic-${name}`

export const TOKEN_SCOPE = 'html:root:root, html:root:root body, html:root:root ytmusic-app, html:root:root ytmusic-player-page, html:root:root ytmusic-player-bar'

export const LOOK_GROUPS = ['Farben', 'Dichte', 'Typografie', 'Player', 'Allgemein']

export const colorControls = [
  {
    id: 'bg',
    label: 'Hintergrund',
    tokens: [T('background'), T('general-background-c'), T('nav-bar'), T('player-page-background'), T('color-black4')],
    extra: (v) => `html:root body, ytmusic-app-layout #nav-bar-background, ytmusic-app-layout #mini-guide-background, ytmusic-app-layout #guide-wrapper, ytmusic-browse-response #background { background-color: ${v} !important; }`
  },
  { id: 'raised', label: 'Flächen & Karten', tokens: [T('brand-background-solid'), T('color-black1'), T('color-black2'), T('search-background'), T('horizontal-action-card-background')] },
  { id: 'menu', label: 'Menüs & Dialoge', tokens: [], extra: (v) => `ytmusic-menu-popup-renderer, tp-yt-paper-listbox, ytmusic-dialog, tp-yt-paper-dialog, ytmusic-search-suggestions-section { background-color: ${v} !important; }` },
  { id: 'text', label: 'Text', tokens: [T('text-primary'), T('color-white1')] },
  { id: 'textSecondary', label: 'Text gedimmt', tokens: [T('text-secondary'), T('overlay-text-secondary'), T('search-box-text-secondary')] },
  { id: 'accent', label: 'Akzent & Links', tokens: [T('search-suggestion-focus-active')], extra: (v) => `ytmusic-app a.yt-simple-endpoint:hover, ytmusic-chip-cloud-chip-renderer[is-selected] { color: ${v} !important; }` },
  { id: 'outline', label: 'Rahmen & Trenner', tokens: [T('divider'), T('guide-divider'), T('search-border'), T('search-bar-border-bauhaus')] },
  {
    id: 'playerBar',
    label: 'Playerleiste',
    tokens: [T('player-bar-background')],
    extra: (v) => `ytmusic-player-bar, ytmusic-app-layout #player-bar-background { background: ${v} !important; }`
  },
  {
    id: 'progress',
    label: 'Fortschrittsbalken',
    tokens: [],
    extra: (v) => `ytmusic-player-bar #progress-bar, ytmusic-player-page #progress-bar { --paper-slider-active-color: ${v} !important; --paper-slider-knob-color: ${v} !important; --paper-slider-knob-start-color: ${v} !important; } ytmusic-player-bar #progress-bar #primaryProgress { background: ${v} !important; }`
  }
]

export const themes = [
  { id: '', label: 'YouTube Music (unverändert)', values: {} },
  { id: 'oled', label: 'OLED Schwarz', values: { bg: '#000000', raised: '#0e0e0e', menu: '#161616', text: '#ededed', textSecondary: '#9a9a9a', accent: '#5aa9ff', outline: '#262626', playerBar: '#0a0a0a', progress: '#e53935' } },
  { id: 'nord', label: 'Nord', values: { bg: '#2e3440', raised: '#3b4252', menu: '#434c5e', text: '#eceff4', textSecondary: '#a9b1c1', accent: '#88c0d0', outline: '#4c566a', playerBar: '#3b4252', progress: '#88c0d0' } },
  { id: 'gruvbox', label: 'Gruvbox', values: { bg: '#282828', raised: '#3c3836', menu: '#504945', text: '#ebdbb2', textSecondary: '#a89984', accent: '#fabd2f', outline: '#504945', playerBar: '#32302f', progress: '#fe8019' } },
  { id: 'dracula', label: 'Dracula', values: { bg: '#282a36', raised: '#343746', menu: '#3e4153', text: '#f8f8f2', textSecondary: '#a4a8c0', accent: '#bd93f9', outline: '#44475a', playerBar: '#343746', progress: '#ff79c6' } },
  { id: 'solarized', label: 'Solarized Dark', values: { bg: '#002b36', raised: '#073642', menu: '#0b4452', text: '#eee8d5', textSecondary: '#93a1a1', accent: '#2aa198', outline: '#0f4b59', playerBar: '#073642', progress: '#cb4b16' } },
  { id: 'vinyl', label: 'Vinyl (warm)', values: { bg: '#1b1612', raised: '#2a221c', menu: '#342a22', text: '#f3e9dc', textSecondary: '#b8a590', accent: '#e0a458', outline: '#3d3128', playerBar: '#241d18', progress: '#e0a458' } }
]

const CARD_TITLES = 'ytmusic-two-row-item-renderer .title, ytmusic-responsive-list-item-renderer .title'

export const controls = [
  {
    id: 'thumbSize',
    label: 'Kachelgröße in Karussells',
    group: 'Dichte',
    type: 'range',
    min: 120,
    max: 320,
    step: 10,
    unit: 'px',
    placeholder: 180,
    css: (v) => `ytmusic-carousel ytmusic-two-row-item-renderer:not([aspect-ratio="MUSIC_TWO_ROW_ITEM_THUMBNAIL_ASPECT_RATIO_RECTANGLE_16_9"]) { width: ${v}px !important; } ytmusic-carousel ytmusic-two-row-item-renderer #item-thumbnail, ytmusic-carousel ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer { width: ${v}px !important; height: ${v}px !important; }`
  },
  {
    id: 'rowHeight',
    label: 'Zeilenhöhe in Listen',
    group: 'Dichte',
    type: 'range',
    min: 40,
    max: 80,
    step: 2,
    unit: 'px',
    placeholder: 56,
    css: (v) => `ytmusic-responsive-list-item-renderer[height-style="MUSIC_RESPONSIVE_LIST_ITEM_HEIGHT_MEDIUM"], ytmusic-responsive-list-item-renderer { min-height: ${v}px !important; height: auto !important; } ytmusic-player-queue-item { height: ${v}px !important; }`
  },
  {
    id: 'contentWidth',
    label: 'Maximale Inhaltsbreite',
    group: 'Dichte',
    type: 'range',
    min: 800,
    max: 2600,
    step: 50,
    unit: 'px',
    placeholder: 1478,
    css: (v) => `ytmusic-browse-response #content-wrapper, ytmusic-search-page #contents, ytmusic-section-list-renderer.ytmusic-browse-response { max-width: ${v}px !important; margin-inline: auto !important; } ytmusic-app { --ytmusic-content-width: ${v}px !important; }`
  },
  {
    id: 'radius',
    label: 'Ecken-Rundung',
    group: 'Dichte',
    type: 'range',
    min: 0,
    max: 24,
    step: 1,
    unit: 'px',
    placeholder: 4,
    css: (v) => `ytmusic-thumbnail-renderer img, ytmusic-two-row-item-renderer #item-thumbnail, ytmusic-responsive-list-item-renderer ytmusic-thumbnail-renderer, ytmusic-player-bar .thumbnail-image-wrapper img, ytmusic-player-queue-item .thumbnail img, #song-image img { border-radius: ${v}px !important; }`
  },
  {
    id: 'font',
    label: 'Schrift',
    group: 'Typografie',
    type: 'select',
    options: [
      ['', 'YouTube Music'],
      ['system-ui, -apple-system, "Segoe UI", sans-serif', 'System'],
      ['Inter, system-ui, sans-serif', 'Inter (falls installiert)'],
      ['"Segoe UI", system-ui, sans-serif', 'Segoe UI'],
      ['Georgia, "Times New Roman", serif', 'Serif'],
      ['"JetBrains Mono", Consolas, monospace', 'Monospace']
    ],
    css: (v) => `ytmusic-app, ytmusic-app *:not(yt-icon):not(svg):not(path), ytmusic-popup-container * { font-family: ${v} !important; }`
  },
  {
    id: 'titleSize',
    label: 'Titelgröße',
    group: 'Typografie',
    type: 'range',
    min: 11,
    max: 22,
    step: 1,
    unit: 'px',
    placeholder: 14,
    css: (v) => `${CARD_TITLES} { font-size: ${v}px !important; line-height: 1.35 !important; }`
  },
  {
    id: 'lyricsSize',
    label: 'Songtext-Schriftgröße',
    group: 'Typografie',
    type: 'range',
    min: 12,
    max: 40,
    step: 1,
    unit: 'px',
    placeholder: 18,
    css: (v) => `ytmusic-player-page ytmusic-description-shelf-renderer .description, ytmusic-player-page ytmusic-description-shelf-renderer yt-formatted-string.description { font-size: ${v}px !important; line-height: 1.5 !important; }`
  },
  {
    id: 'playerBarHeight',
    label: 'Höhe Playerleiste',
    group: 'Player',
    type: 'range',
    min: 56,
    max: 110,
    step: 2,
    unit: 'px',
    placeholder: 72,
    css: (v) => `ytmusic-app-layout { --ytmusic-player-bar-height: ${v}px !important; } ytmusic-player-bar { height: ${v}px !important; }`
  },
  {
    id: 'coverBlur',
    label: 'Hintergrund-Unschärfe Player',
    group: 'Player',
    type: 'range',
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
    placeholder: 100,
    css: (v) => `ytmusic-player-page #background, ytmusic-browse-response #background { opacity: ${v / 100} !important; }`
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
  },
  {
    id: 'motion',
    label: 'Animationen',
    group: 'Allgemein',
    type: 'select',
    options: [['', 'Normal'], ['reduced', 'Reduziert'], ['off', 'Aus']],
    css: (v) =>
      v === 'off'
        ? `ytmusic-app *, ytmusic-app *::before, ytmusic-app *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }`
        : `ytmusic-app *, ytmusic-app *::before, ytmusic-app *::after { transition-duration: 60ms !important; animation-duration: 60ms !important; }`
  },
  {
    id: 'scrollbar',
    label: 'Scrollbalken',
    group: 'Allgemein',
    type: 'select',
    options: [['', 'Normal'], ['thin', 'Schmal'], ['none', 'Versteckt']],
    css: (v) => (v === 'none' ? `html, body { scrollbar-width: none !important; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }` : `html, body { scrollbar-width: thin !important; }`)
  }
]

export const controlById = Object.fromEntries([...controls, ...colorControls.map((c) => ({ ...c, type: 'color', group: 'Farben' }))].map((c) => [c.id, c]))

// eigene ytx elemente nutzen youtube tokens, auf music auf die music farben umbiegen
export function extraCss(colors) {
  const out = []
  const map = { bg: 'base-background', raised: 'raised-background', menu: 'menu-background', text: 'text-primary', textSecondary: 'text-secondary', accent: 'call-to-action', outline: 'outline' }
  const decl = Object.entries(map)
    .filter(([k]) => colors[k])
    .map(([k, t]) => `--yt-sys-color-baseline--${t}: ${colors[k]};`)
  if (decl.length) out.push(`html:root:root { ${decl.join(' ')} }`)
  return out.join('\n')
}
