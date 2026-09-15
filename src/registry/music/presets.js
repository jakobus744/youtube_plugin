// layout presets fuer music

export const layoutPresets = [
  {
    id: 'compact',
    label: 'Kompakt',
    pages: ['home', 'explore', 'artist', 'library'],
    css: (s) => `
${s} ytmusic-carousel ytmusic-two-row-item-renderer:not([aspect-ratio*="16_9"]) { width: 140px !important; }
${s} ytmusic-carousel ytmusic-two-row-item-renderer #item-thumbnail, ${s} ytmusic-carousel ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer { width: 140px !important; height: 140px !important; }
${s} ytmusic-carousel-shelf-renderer { margin-bottom: 20px !important; }
${s} ytmusic-responsive-list-item-renderer { min-height: 44px !important; }`
  },
  {
    id: 'list',
    label: 'Listen statt Karussells',
    pages: ['home', 'explore'],
    css: (s) => `
${s} ytmusic-carousel-shelf-renderer ytmusic-carousel #items { display: flex !important; flex-wrap: wrap !important; gap: 12px !important; transform: none !important; }
${s} ytmusic-carousel-shelf-renderer ytmusic-carousel { overflow: visible !important; }
${s} ytmusic-carousel-shelf-renderer #next-items-button, ${s} ytmusic-carousel-shelf-renderer #previous-items-button { display: none !important; }`
  },
  {
    id: 'lyricsFocus',
    label: 'Songtext groß',
    pages: ['watch'],
    css: (s) => `
${s} ytmusic-player-page #side-panel { flex: 1 1 60% !important; max-width: none !important; }
${s} ytmusic-player-page #main-panel { flex: 1 1 40% !important; }
${s} ytmusic-player-page ytmusic-description-shelf-renderer .description { font-size: 22px !important; line-height: 1.6 !important; }`
  },
  {
    id: 'queueWide',
    label: 'Warteschlange breit',
    pages: ['watch'],
    css: (s) => `
${s} ytmusic-player-page #side-panel { flex: 1 1 55% !important; max-width: none !important; }
${s} ytmusic-player-page #main-panel { flex: 1 1 45% !important; }`
  }
]

export const presetById = Object.fromEntries(layoutPresets.map((p) => [p.id, p]))

export const LAYOUT_PAGES = [
  ['home', 'Startseite'],
  ['explore', 'Entdecken'],
  ['artist', 'Künstler'],
  ['library', 'Mediathek'],
  ['watch', 'Player']
]

export const orderGroups = {}

export const topbarModes = [
  ['', 'Fixiert (YouTube Music)'],
  ['autohide', 'Beim Runterscrollen ausblenden']
]

export const topbarCss = {
  autohide: `html[data-ytx-scrolled-down] ytmusic-nav-bar, html[data-ytx-scrolled-down] ytmusic-app-layout #nav-bar-background { transform: translateY(-100%) !important; } ytmusic-nav-bar, ytmusic-app-layout #nav-bar-background { transition: transform .2s ease !important; }`
}
