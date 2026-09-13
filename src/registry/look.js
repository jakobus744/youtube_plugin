// look einstellungen
// config speichert nur control ids nie youtube variablennamen

const TOKEN = (name) => `--yt-sys-color-baseline--${name}`

export const LOOK_GROUPS = ['Farben', 'Dichte', 'Typografie', 'Thumbnails', 'Buttons', 'Allgemein']

export const colorControls = [
  { id: 'bg', label: 'Hintergrund', tokens: [TOKEN('base-background'), '--yt-spec-base-background'], extra: (v) => `ytd-app, #masthead-container, ytd-masthead, #background.ytd-masthead, tp-yt-app-drawer #contentContainer, ytd-mini-guide-renderer { background-color: ${v} !important; }` },
  { id: 'raised', label: 'Flächen & Karten', tokens: [TOKEN('raised-background'), '--yt-spec-raised-background'] },
  { id: 'menu', label: 'Menüs & Dialoge', tokens: [TOKEN('menu-background'), '--yt-spec-menu-background'] },
  { id: 'text', label: 'Text', tokens: [TOKEN('text-primary'), '--yt-spec-text-primary'] },
  { id: 'textSecondary', label: 'Text gedimmt', tokens: [TOKEN('text-secondary'), '--yt-spec-text-secondary'] },
  { id: 'accent', label: 'Akzent & Links', tokens: [TOKEN('call-to-action'), TOKEN('call-to-action-hover'), '--yt-spec-call-to-action'] },
  { id: 'outline', label: 'Rahmen & Trenner', tokens: [TOKEN('outline'), TOKEN('outline-opaque'), '--yt-spec-10-percent-layer'] },
  {
    id: 'progress',
    label: 'Fortschrittsbalken',
    tokens: [],
    extra: (v) =>
      `#movie_player .ytp-play-progress, #movie_player .ytp-swatch-background-color, ytd-thumbnail-overlay-resume-playback-renderer #progress, [class*="ProgressBarSegment"] { background: ${v} !important; } #movie_player .ytp-scrubber-button { background: ${v} !important; }`
  }
]

export const themes = [
  { id: '', label: 'YouTube (unverändert)', values: {} },
  { id: 'oled', label: 'OLED Schwarz', values: { bg: '#000000', raised: '#0e0e0e', menu: '#161616', text: '#ededed', textSecondary: '#9a9a9a', accent: '#5aa9ff', outline: '#262626', progress: '#e53935' } },
  { id: 'nord', label: 'Nord', values: { bg: '#2e3440', raised: '#3b4252', menu: '#434c5e', text: '#eceff4', textSecondary: '#a9b1c1', accent: '#88c0d0', outline: '#4c566a', progress: '#88c0d0' } },
  { id: 'gruvbox', label: 'Gruvbox', values: { bg: '#282828', raised: '#3c3836', menu: '#504945', text: '#ebdbb2', textSecondary: '#a89984', accent: '#fabd2f', outline: '#504945', progress: '#fe8019' } },
  { id: 'dracula', label: 'Dracula', values: { bg: '#282a36', raised: '#343746', menu: '#3e4153', text: '#f8f8f2', textSecondary: '#a4a8c0', accent: '#bd93f9', outline: '#44475a', progress: '#ff79c6' } },
  { id: 'solarized', label: 'Solarized Dark', values: { bg: '#002b36', raised: '#073642', menu: '#0b4452', text: '#eee8d5', textSecondary: '#93a1a1', accent: '#2aa198', outline: '#0f4b59', progress: '#cb4b16' } }
]

const RICH_GRID = 'ytd-rich-grid-renderer'
const CARD_TITLES = '#video-title, yt-lockup-metadata-view-model h3, yt-lockup-metadata-view-model h3 a, [class*="LockupMetadataViewModelTitle"]'

export const controls = [
  // dichte
  {
    id: 'columns',
    label: 'Spalten im Raster',
    group: 'Dichte',
    type: 'range',
    min: 1,
    max: 8,
    step: 1,
    placeholder: 4,
    css: (v) => `${RICH_GRID} { --ytd-rich-grid-items-per-row: ${v} !important; --ytd-rich-grid-posts-per-row: ${v} !important; --ytd-rich-grid-slim-items-per-row: ${Math.max(v, 2)} !important; --ytd-rich-grid-game-cards-per-row: ${v} !important; }`
  },
  {
    id: 'gap',
    label: 'Abstand zwischen Kacheln',
    group: 'Dichte',
    type: 'range',
    min: 0,
    max: 40,
    step: 2,
    unit: 'px',
    placeholder: 16,
    css: (v) => `${RICH_GRID} { --ytd-rich-grid-item-margin: ${v}px !important; --ytd-rich-grid-row-margin: ${v}px !important; } ytd-rich-item-renderer[rendered-from-rich-grid] { margin-bottom: ${v * 1.5}px !important; }`
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
    placeholder: 1800,
    css: (v) => `ytd-browse[page-subtype="home"] ytd-rich-grid-renderer, ytd-browse[page-subtype="subscriptions"] ytd-rich-grid-renderer, ytd-search ytd-two-column-search-results-renderer { max-width: ${v}px !important; margin-inline: auto !important; }`
  },
  {
    id: 'playerWidth',
    label: 'Maximale Playerbreite',
    group: 'Dichte',
    type: 'range',
    min: 640,
    max: 2600,
    step: 20,
    unit: 'px',
    placeholder: 1280,
    css: (v) => `:root { --ytx-player-max-w: ${v}px; } ytd-watch-flexy { --ytd-watch-flexy-max-player-width: ${v}px !important; }`
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
    placeholder: 12,
    css: (v) =>
      `ytd-thumbnail a#thumbnail, ytd-thumbnail yt-image img, ytd-thumbnail #thumbnail, yt-thumbnail-view-model, yt-thumbnail-view-model img, [class*="ThumbnailViewModelImage"], ytd-playlist-thumbnail, ytd-watch-flexy[rounded-player] #ytd-player, ytd-watch-flexy[rounded-player-large] #ytd-player, #cinematics canvas { border-radius: ${v}px !important; }`
  },

  // typografie
  {
    id: 'font',
    label: 'Schrift',
    group: 'Typografie',
    type: 'select',
    options: [
      ['', 'YouTube (Roboto)'],
      ['system-ui, -apple-system, "Segoe UI", sans-serif', 'System'],
      ['Inter, system-ui, sans-serif', 'Inter (falls installiert)'],
      ['"Segoe UI", system-ui, sans-serif', 'Segoe UI'],
      ['Georgia, "Times New Roman", serif', 'Serif'],
      ['"JetBrains Mono", Consolas, monospace', 'Monospace']
    ],
    css: (v) => `ytd-app, ytd-app *:not(yt-icon):not(svg):not(path), tp-yt-paper-dialog, ytd-popup-container * { font-family: ${v} !important; }`
  },
  {
    id: 'titleSize',
    label: 'Titelgröße Kacheln',
    group: 'Typografie',
    type: 'range',
    min: 11,
    max: 24,
    step: 1,
    unit: 'px',
    placeholder: 16,
    css: (v) => `${CARD_TITLES} { font-size: ${v}px !important; line-height: 1.35 !important; }`
  },
  {
    id: 'titleLines',
    label: 'Titelzeilen',
    group: 'Typografie',
    type: 'range',
    min: 1,
    max: 5,
    step: 1,
    placeholder: 2,
    css: (v) => `${CARD_TITLES}, ${CARD_TITLES} span { -webkit-line-clamp: ${v} !important; line-clamp: ${v} !important; max-height: none !important; }`
  },
  {
    id: 'titleWeight',
    label: 'Titelstärke',
    group: 'Typografie',
    type: 'select',
    options: [['', 'YouTube'], ['400', 'Normal'], ['500', 'Mittel'], ['600', 'Halbfett'], ['700', 'Fett']],
    css: (v) => `${CARD_TITLES} { font-weight: ${v} !important; }`
  },
  {
    id: 'metaSize',
    label: 'Kanal & Aufrufe',
    group: 'Typografie',
    type: 'range',
    min: 10,
    max: 18,
    step: 1,
    unit: 'px',
    placeholder: 14,
    css: (v) => `#metadata-line, ytd-video-meta-block #metadata, ytd-channel-name #text, yt-content-metadata-view-model, yt-content-metadata-view-model span { font-size: ${v}px !important; line-height: 1.4 !important; }`
  },
  {
    id: 'watchTitleSize',
    label: 'Videotitel auf Videoseite',
    group: 'Typografie',
    type: 'range',
    min: 14,
    max: 32,
    step: 1,
    unit: 'px',
    placeholder: 20,
    css: (v) => `ytd-watch-metadata #title h1, ytd-watch-metadata #title h1 yt-formatted-string { font-size: ${v}px !important; line-height: 1.3 !important; }`
  },

  // thumbnails
  {
    id: 'listThumbWidth',
    label: 'Thumbnail-Breite in Listen',
    group: 'Thumbnails',
    type: 'range',
    min: 100,
    max: 500,
    step: 10,
    unit: 'px',
    placeholder: 360,
    css: (v) =>
      `ytd-search ytd-video-renderer ytd-thumbnail, ytd-search yt-lockup-view-model a[class*="ContentImage"], ytd-watch-next-secondary-results-renderer yt-lockup-view-model a[class*="ContentImage"], ytd-compact-video-renderer ytd-thumbnail, ytd-browse[page-subtype="playlist"] yt-lockup-view-model a[class*="ContentImage"], ytd-playlist-video-renderer ytd-thumbnail { width: ${v}px !important; min-width: ${v}px !important; max-width: ${v}px !important; flex: none !important; }`
  },

  // buttons
  {
    id: 'actionsScale',
    label: 'Größe Aktionsleiste',
    group: 'Buttons',
    type: 'range',
    min: 60,
    max: 150,
    step: 5,
    unit: '%',
    placeholder: 100,
    css: (v) => `ytd-watch-metadata #actions { zoom: ${v / 100} !important; }`
  },

  // allgemein
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
        ? `ytd-app *, ytd-app *::before, ytd-app *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; scroll-behavior: auto !important; }`
        : `ytd-app *, ytd-app *::before, ytd-app *::after { transition-duration: 60ms !important; animation-duration: 60ms !important; }`
  },
  {
    id: 'scrollbar',
    label: 'Scrollbalken',
    group: 'Allgemein',
    type: 'select',
    options: [['', 'Normal'], ['thin', 'Schmal'], ['none', 'Versteckt']],
    css: (v) => (v === 'none' ? `html, body { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none; }` : `html, body { scrollbar-width: thin !important; }`)
  }
]

export const controlById = Object.fromEntries([...controls, ...colorControls.map((c) => ({ ...c, type: 'color', group: 'Farben' }))].map((c) => [c.id, c]))
