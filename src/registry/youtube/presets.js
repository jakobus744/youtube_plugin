// layout presets
// css(s) bekommt den scope selektor der nur bei aktivem preset greift

const GRID_PAGES = ['home', 'subscriptions', 'channel']

export const layoutPresets = [
  {
    id: 'compact',
    label: 'Kompakt',
    pages: [...GRID_PAGES, 'search'],
    css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 6 !important; --ytd-rich-grid-posts-per-row: 6 !important; --ytd-rich-grid-item-margin: 8px !important; }
${s} ytd-rich-item-renderer[rendered-from-rich-grid] { margin-bottom: 16px !important; }
${s} #video-title, ${s} yt-lockup-metadata-view-model h3 { font-size: 13px !important; line-height: 1.3 !important; }
${s} yt-content-metadata-view-model, ${s} #metadata-line { font-size: 12px !important; }
${s} ytd-search ytd-video-renderer ytd-thumbnail, ${s} ytd-search yt-lockup-view-model a[class*="ContentImage"] { max-width: 240px !important; min-width: 240px !important; }
${s} ytd-search #description-text, ${s} ytd-search .metadata-snippet-container { display: none !important; }`
  },
  {
    id: 'list',
    label: 'Liste',
    pages: GRID_PAGES,
    css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 1 !important; --ytd-rich-grid-posts-per-row: 1 !important; }
${s} ytd-rich-grid-renderer > #contents { max-width: 1100px !important; margin: 0 auto !important; }
${s} ytd-rich-item-renderer[rendered-from-rich-grid] { width: 100% !important; margin: 0 0 12px !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model > div { flex-direction: row !important; align-items: flex-start !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model a[class*="ContentImage"] { width: 320px !important; min-width: 320px !important; flex: none !important; margin-right: 16px !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model [class*="MetadataViewModel"] { flex: 1 !important; }
${s} ytd-rich-item-renderer ytd-rich-grid-media #dismissible { display: flex !important; flex-direction: row !important; }
${s} ytd-rich-item-renderer ytd-rich-grid-media ytd-thumbnail { width: 320px !important; min-width: 320px !important; margin-right: 16px !important; }
${s} ytd-rich-section-renderer { width: 100% !important; max-width: 1100px !important; margin-inline: auto !important; }`
  },
  {
    id: 'text',
    label: 'Nur Text',
    pages: [...GRID_PAGES, 'search'],
    css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 1 !important; }
${s} ytd-rich-grid-renderer > #contents { max-width: 900px !important; margin: 0 auto !important; }
${s} ytd-rich-item-renderer[rendered-from-rich-grid] { width: 100% !important; margin: 0 0 4px !important; }
${s} ytd-thumbnail, ${s} yt-thumbnail-view-model, ${s} a[class*="ContentImage"], ${s} #avatar-link, ${s} yt-decorated-avatar-view-model { display: none !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model > div, ${s} ytd-video-renderer #dismissible { flex-direction: row !important; }
${s} ytd-rich-item-renderer, ${s} ytd-video-renderer, ${s} ytd-search yt-lockup-view-model { border-bottom: 1px solid var(--yt-sys-color-baseline--outline, #333) !important; padding: 8px 0 !important; }
${s} ytd-search #description-text, ${s} ytd-search .metadata-snippet-container { display: none !important; }`
  },
  {
    id: 'classic',
    label: 'Classic',
    pages: [...GRID_PAGES, 'search', 'watch', 'playlist'],
    css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 5 !important; --ytd-rich-grid-posts-per-row: 5 !important; }
${s} ytd-thumbnail a#thumbnail, ${s} ytd-thumbnail yt-image img, ${s} yt-thumbnail-view-model, ${s} yt-thumbnail-view-model img, ${s} [class*="ThumbnailViewModelImage"], ${s} #ytd-player, ${s} ytd-playlist-thumbnail { border-radius: 0 !important; }
${s} #video-title, ${s} yt-lockup-metadata-view-model h3 { font-size: 14px !important; font-weight: 500 !important; }
${s} #cinematics, ${s} #cinematics-container { display: none !important; }
${s} yt-button-shape button, ${s} button[class*="ButtonShape"] { border-radius: 2px !important; }
${s} #avatar img, ${s} yt-avatar-shape img { border-radius: 0 !important; }`
  },
  {
    id: 'theater',
    label: 'Kino (breit, Empfehlungen unten)',
    pages: ['watch'],
    resize: true,
    css: (s) => `
${s} ytd-watch-flexy:not([fullscreen]) #columns { flex-direction: column !important; align-items: center !important; }
${s} ytd-watch-flexy:not([fullscreen]) #primary { width: min(100%, var(--ytx-player-max-w, 1400px)) !important; max-width: none !important; min-width: 0 !important; margin: 0 auto !important; padding-right: 0 !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary { width: min(100%, var(--ytx-player-max-w, 1400px)) !important; max-width: none !important; padding: 0 !important; margin: 0 auto !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary #related { display: block !important; }`
  },
  {
    id: 'focus',
    label: 'Fokus (nur Player & Beschreibung)',
    pages: ['watch'],
    resize: true,
    css: (s) => `
${s} ytd-watch-flexy:not([fullscreen]) #columns { justify-content: center !important; }
${s} ytd-watch-flexy:not([fullscreen]) #primary { width: min(100%, var(--ytx-player-max-w, 1280px)) !important; max-width: none !important; min-width: 0 !important; padding-right: 0 !important; margin: 0 auto !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary #related, ${s} ytd-watch-flexy ytd-comments#comments { display: none !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary:not(:has(ytd-playlist-panel-renderer:not([hidden]))):not(:has(ytd-live-chat-frame)) { display: none !important; }`
  },
  {
    id: 'wideList',
    label: 'Breite Liste',
    pages: ['playlist', 'search'],
    css: (s) => `
${s} ytd-search ytd-two-column-search-results-renderer, ${s} ytd-search #container.ytd-search { max-width: 1400px !important; }
${s} ytd-browse[page-subtype="playlist"] ytd-two-column-browse-results-renderer { max-width: 1600px !important; }
${s} ytd-browse[page-subtype="playlist"] ytd-two-column-browse-results-renderer #primary { max-width: none !important; }`
  }
]

export const presetById = Object.fromEntries(layoutPresets.map((p) => [p.id, p]))

export const LAYOUT_PAGES = [
  ['home', 'Startseite'],
  ['subscriptions', 'Abos'],
  ['search', 'Suche'],
  ['watch', 'Videoseite'],
  ['channel', 'Kanal'],
  ['playlist', 'Playlist']
]

// reihenfolge von buttons innerhalb eines containers
export const orderGroups = {
  'watch.actions': {
    label: 'Aktionsleiste unter dem Video',
    items: [
      ['like', 'Like / Dislike'],
      ['share', 'Teilen'],
      ['save', 'Speichern'],
      ['download', 'Herunterladen'],
      ['clip', 'Clip'],
      ['thanks', 'Super Thanks'],
      ['ask', 'KI-Fragen'],
      ['ytx', 'ytx-Buttons']
    ],
    container: `ytd-watch-metadata #actions ytd-menu-renderer { display: flex !important; flex-wrap: nowrap !important; align-items: center !important; }
ytd-watch-metadata #actions ytd-menu-renderer > #top-level-buttons-computed, ytd-watch-metadata #actions ytd-menu-renderer > #flexible-item-buttons { display: contents !important; }
ytd-watch-metadata #actions ytd-menu-renderer > yt-button-shape, ytd-watch-metadata #actions ytd-menu-renderer > yt-icon-button { order: 999 !important; }
ytd-watch-metadata #actions ytd-menu-renderer [data-ytx-btn] { order: 500; }
ytd-watch-metadata #actions ytd-menu-renderer [data-ytx-btn] + [data-ytx-btn] { margin-left: 8px; }`,
    item: (id, i) => (id === 'ytx' ? `ytd-watch-metadata #actions [data-ytx-mount^="actions."] { order: ${i} !important; }` : `ytd-watch-metadata #actions [data-ytx-btn="${id}"] { order: ${i} !important; }`)
  }
}

export const topbarModes = [
  ['', 'Fixiert (YouTube)'],
  ['static', 'Mitscrollen'],
  ['autohide', 'Beim Runterscrollen ausblenden']
]

export const topbarCss = {
  static: `ytd-app #masthead-container.ytd-app { position: absolute !important; }`,
  autohide: `html[data-ytx-scrolled-down] ytd-app #masthead-container.ytd-app { transform: translateY(-100%) !important; transition: transform .2s ease !important; } ytd-app #masthead-container.ytd-app { transition: transform .2s ease !important; }`
}
