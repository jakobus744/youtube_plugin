// was auf m.youtube.com ausgeblendet werden kann
// data-ytx-mb* attribute setzt der tagger aus registry/mobile/tags.js

import { SH, SDCH } from '../shared.js'

export const GROUPS = ['Navigation', 'Startseite', 'Videoseite', 'Suche', 'Kanal', 'Abo-Feed', 'Werbung']

export const targets = [
  // navigation unten
  {
    id: 'mb.pivot.shorts',
    label: 'Shorts-Knopf in der Leiste unten',
    group: 'Navigation',
    modes: SH,
    sel: ['ytm-pivot-bar-item-renderer[data-ytx-mbpivot="shorts"]']
  },
  {
    id: 'mb.pivot.create',
    label: 'Erstellen-Button (+) unten',
    group: 'Navigation',
    modes: SH,
    sel: ['ytm-pivot-bar-item-renderer[data-ytx-mbpivot="create"]']
  },
  {
    id: 'mb.pivot.all',
    label: 'Untere Leiste komplett',
    group: 'Navigation',
    radical: true,
    modes: SH,
    sel: ['ytm-pivot-bar-renderer'],
    note: 'Navigation dann über Logo, Suche und Zurück'
  },
  {
    id: 'mb.top.openApp',
    label: '„Open App“ oben (abgemeldet)',
    group: 'Navigation',
    modes: SH,
    sel: ['ytm-mobile-topbar-renderer ytm-button-renderer.icon-avatar_logged_out', 'ytm-mobile-topbar-renderer .mobile-topbar-header-sign-in-button'],
    note: 'Anmelden geht weiter über den Tab „Mein YouTube“'
  },
  {
    id: 'mb.top.cast',
    label: 'Cast-Button oben',
    group: 'Navigation',
    modes: SH,
    sel: ['ytm-mobile-topbar-renderer .topbar-cast-button', 'ytm-mobile-topbar-renderer [class*="cast"]']
  },

  // startseite
  {
    id: 'mb.home.chips',
    label: 'Filter-Chips',
    group: 'Startseite',
    pages: ['home'],
    modes: SH,
    sel: ['ytm-browse ytm-feed-filter-chip-bar-renderer', 'ytm-browse ytm-chip-cloud-renderer']
  },
  {
    id: 'mb.home.shorts',
    label: 'Shorts-Regale',
    group: 'Startseite',
    pages: ['home'],
    modes: SDCH,
    sel: ['ytm-browse ytm-reel-shelf-renderer', 'ytm-browse ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model)', 'ytm-browse grid-shelf-view-model:has(ytm-shorts-lockup-view-model)']
  },
  {
    id: 'mb.home.sections',
    label: 'Themen-Regale (Neu, Nachrichten …)',
    group: 'Startseite',
    pages: ['home'],
    modes: SDCH,
    sel: ['ytm-browse ytm-rich-section-renderer:not(:has(ytm-shorts-lockup-view-model))']
  },
  {
    id: 'mb.home.nudge',
    label: 'Hinweis-Boxen (Anmelden, Verlauf …)',
    group: 'Startseite',
    modes: SH,
    sel: ['ytm-feed-nudge-renderer']
  },
  {
    id: 'mb.home.feed',
    label: 'Empfehlungen komplett',
    group: 'Startseite',
    pages: ['home'],
    radical: true,
    modes: SH,
    sel: ['ytm-browse ytm-rich-grid-renderer'],
    note: 'Startseite bleibt leer, tipp auf Abos'
  },

  // videoseite
  {
    id: 'mb.watch.related',
    label: 'Empfohlene Videos',
    group: 'Videoseite',
    pages: ['watch'],
    modes: SDCH,
    sel: ['ytm-watch ytm-item-section-renderer[section-identifier="related-items"]', 'ytm-watch .related-items-container']
  },
  {
    id: 'mb.watch.comments',
    label: 'Kommentar-Vorschau',
    group: 'Videoseite',
    pages: ['watch'],
    modes: SDCH,
    sel: ['ytm-watch ytm-item-section-renderer:has(yt-comment-teaser-carousel-item-view-model)', 'ytm-watch ytm-comments-entry-point-header-renderer', 'ytm-watch ytm-item-section-renderer[section-identifier="comments-entry-point"]']
  },
  {
    id: 'mb.watch.shorts',
    label: 'Shorts bei den Empfehlungen',
    group: 'Videoseite',
    pages: ['watch'],
    modes: SH,
    sel: ['ytm-watch ytm-reel-shelf-renderer', 'ytm-watch grid-shelf-view-model:has(ytm-shorts-lockup-view-model)', 'ytm-watch ytm-shorts-lockup-view-model']
  },
  {
    id: 'mb.watch.carousel',
    label: 'Info-Karussell unter dem Titel',
    group: 'Videoseite',
    pages: ['watch'],
    modes: SH,
    // das karussell mit der kommentar vorschau gehoert zu den kommentaren und wird dort geregelt
    sel: ['ytm-watch yt-video-metadata-carousel-view-model:not(:has(yt-comment-teaser-carousel-item-view-model))']
  },
  {
    id: 'mb.watch.endscreen',
    label: 'Endbildschirm im Player',
    group: 'Videoseite',
    modes: SH,
    sel: ['#player-endscreen-container', '#movie_player .ytp-ce-element', '#movie_player .ytp-endscreen-content']
  },

  // suche
  {
    id: 'mb.search.shorts',
    label: 'Shorts in der Suche',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    // shorts regale mit ueberschrift ganz ausblenden, nicht nur die kacheln
    sel: ['ytm-search ytm-reel-shelf-renderer', 'ytm-search grid-shelf-view-model:has(ytm-shorts-lockup-view-model)', 'ytm-search ytm-shorts-lockup-view-model', 'ytm-search ytm-video-with-context-renderer:has(a[href^="/shorts/"])']
  },
  {
    id: 'mb.search.shelves',
    label: 'Zusatz-Regale („Andere Nutzer sahen …“)',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    sel: ['ytm-search ytm-horizontal-card-list-renderer', 'ytm-search ytm-shelf-renderer']
  },

  // kanal
  {
    id: 'mb.channel.shortsTab',
    label: 'Shorts-Tab',
    group: 'Kanal',
    pages: ['channel'],
    modes: SH,
    sel: ['ytm-browse yt-tab-shape[data-ytx-mbtab="shorts"]']
  },
  {
    id: 'mb.channel.shorts',
    label: 'Shorts-Regal',
    group: 'Kanal',
    pages: ['channel'],
    modes: SDCH,
    sel: ['ytm-browse ytm-reel-shelf-renderer']
  },

  // abos
  {
    id: 'mb.subs.shorts',
    label: 'Shorts im Abo-Feed',
    group: 'Abo-Feed',
    pages: ['subscriptions'],
    modes: SDCH,
    sel: ['ytm-browse ytm-reel-shelf-renderer', 'ytm-browse ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model)', 'ytm-browse grid-shelf-view-model:has(ytm-shorts-lockup-view-model)']
  },

  // youtube hinweise
  {
    id: 'mb.infoPanel',
    label: 'Info-Hinweise (z. B. „Weitere Informationen zu diesen Ergebnissen“)',
    group: 'Suche',
    modes: SH,
    sel: ['ytm-info-panel-container-renderer']
  },

  // werbung
  {
    id: 'mb.ads',
    label: 'Werbe-Kacheln und Banner',
    group: 'Werbung',
    modes: SH,
    sel: ['ytm-companion-slot', 'ytm-companion-ad-renderer', 'ad-slot-renderer', 'ytm-promoted-sparkles-web-renderer', 'ytm-promoted-video-renderer', 'ytm-rich-item-renderer:has(ad-slot-renderer)', 'ytm-statement-banner-renderer']
  },
  {
    id: 'mb.premiumPromo',
    label: 'Premium-Hinweise',
    group: 'Werbung',
    modes: SH,
    sel: ['ytm-mealbar-promo-renderer', 'ytm-premium-promo-renderer', 'ytm-upsell-dialog-renderer']
  }
]

export const targetById = Object.fromEntries(targets.map((t) => [t.id, t]))

