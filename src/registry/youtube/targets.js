// was veraendert werden kann
// einziger ort fuer selektoren von bestehenden youtube elementen
// data-ytx-* attribute setzt der tagger aus registry/tags.js

import { SH, SDH, SDC, SDCH, MODE_LABELS, attrName } from '../shared.js'

export { MODE_LABELS, attrName }

export const GROUPS = [
  'Seitenleiste',
  'Kopfzeile',
  'Startseite',
  'Videoseite · Bereiche',
  'Videoseite · Buttons',
  'Player',
  'Thumbnails',
  'Suche',
  'Kanal',
  'Abo-Feed',
  'Playlist'
]

export const targets = [
  // seitenleiste
  {
    id: 'guide.shorts',
    label: 'Shorts-Eintrag',
    group: 'Seitenleiste',
    modes: SH,
    sel: ['[data-ytx-guide="shorts"]', 'ytd-guide-entry-renderer:has(a[title="Shorts"])', 'ytd-mini-guide-entry-renderer[aria-label="Shorts"]']
  },
  {
    id: 'guide.explore',
    label: 'Entdecken (Trends, Musik, Gaming …)',
    group: 'Seitenleiste',
    modes: SH,
    sel: ['[data-ytx-guide-section="explore"]']
  },
  {
    id: 'guide.moreYT',
    label: 'Mehr von YouTube',
    group: 'Seitenleiste',
    modes: SH,
    sel: ['[data-ytx-guide-section="more"]']
  },
  {
    id: 'guide.subs',
    label: 'Abo-Liste',
    group: 'Seitenleiste',
    modes: SDCH,
    sel: ['[data-ytx-guide-section="subscriptions"]']
  },
  {
    id: 'guide.you',
    label: 'Mein YouTube / Playlists',
    group: 'Seitenleiste',
    modes: SDCH,
    sel: ['[data-ytx-guide-section="you"]']
  },
  {
    id: 'guide.footer',
    label: 'Fußzeile (Impressum, Links)',
    group: 'Seitenleiste',
    modes: SH,
    sel: ['ytd-guide-renderer #footer', 'ytd-guide-signin-promo-renderer']
  },
  {
    id: 'guide.all',
    label: 'Seitenleiste komplett',
    group: 'Seitenleiste',
    radical: true,
    modes: SH,
    sel: ['tp-yt-app-drawer#guide', 'ytd-mini-guide-renderer', 'ytd-masthead #guide-button'],
    css: { hide: (p) => `${p} ytd-page-manager { margin-left: 0 !important; }` },
    note: 'Navigation dann nur noch über Logo und Suche'
  },

  // kopfzeile
  {
    id: 'top.create',
    label: 'Erstellen-Button',
    group: 'Kopfzeile',
    modes: SH,
    sel: ['ytd-masthead [data-ytx-top="create"]', 'ytd-masthead ytd-button-renderer:has(a[href*="upload"])', 'ytd-masthead #buttons ytd-topbar-menu-button-renderer:has(yt-icon[icon="yt-icons:video_call"])']
  },
  {
    id: 'top.notifications',
    label: 'Benachrichtigungen',
    group: 'Kopfzeile',
    modes: SDH,
    sel: ['ytd-masthead ytd-notification-topbar-button-renderer', 'ytd-masthead [data-ytx-top="notifications"]']
  },
  {
    id: 'top.voice',
    core: true,
    label: 'Sprachsuche',
    group: 'Kopfzeile',
    modes: SH,
    sel: ['ytd-masthead #voice-search-button']
  },
  {
    id: 'top.countryCode',
    label: 'Ländercode am Logo',
    group: 'Kopfzeile',
    modes: SH,
    sel: ['ytd-masthead #country-code']
  },

  // startseite
  {
    id: 'home.shortsShelf',
    label: 'Shorts-Regal',
    group: 'Startseite',
    pages: ['home'],
    modes: SDCH,
    sel: [
      'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
      'ytd-rich-section-renderer:has(a[href^="/shorts/"])',
      'ytd-reel-shelf-renderer',
      'grid-shelf-view-model:has(a[href^="/shorts/"])'
    ]
  },
  {
    id: 'home.chips',
    label: 'Filterleiste (Alle, Musik, Live …)',
    group: 'Startseite',
    pages: ['home'],
    modes: SH,
    sel: ['ytd-browse[page-subtype="home"] ytd-feed-filter-chip-bar-renderer', 'ytd-browse[page-subtype="home"] #chips-wrapper'],
    css: { hide: (p) => `${p} ytd-browse[page-subtype="home"] ytd-rich-grid-renderer { --ytd-rich-grid-chips-bar-height: 0px !important; }` }
  },
  {
    id: 'home.shelves',
    label: 'Themen-Regale (Mixe, News, Empfehlungen)',
    group: 'Startseite',
    pages: ['home'],
    modes: SDCH,
    sel: ['ytd-rich-section-renderer:has(ytd-rich-shelf-renderer:not([is-shorts]))', 'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)'],
    note: 'Mixe und News lassen sich sprachunabhängig nicht sicher trennen'
  },
  {
    id: 'home.banner',
    label: 'Werbebanner & Promo-Kacheln',
    group: 'Startseite',
    pages: ['home'],
    modes: SH,
    sel: ['ytd-rich-item-renderer:has(ytd-ad-slot-renderer)', 'ytd-ad-slot-renderer', '#masthead-ad', 'ytd-banner-promo-renderer', 'ytd-brand-video-singleton-renderer', 'ytd-rich-section-renderer:has(ytd-inline-survey-renderer)'],
    note: 'Blendet nur Container aus, blockiert keine Anfragen'
  },
  {
    id: 'home.feedAll',
    label: 'Startseiten-Feed komplett',
    group: 'Startseite',
    pages: ['home'],
    radical: true,
    modes: SDH,
    sel: ['ytd-browse[page-subtype="home"] ytd-rich-grid-renderer', 'ytd-browse[page-subtype="home"] ytd-two-column-browse-results-renderer'],
    note: 'Sinnvoll zusammen mit Verhalten › Startseite umleiten'
  },

  // videoseite bereiche
  {
    id: 'watch.sidebar',
    core: true,
    label: 'Empfehlungen neben dem Video',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SDCH,
    sel: ['ytd-watch-flexy #related'],
    note: 'Einklappen/Aus lässt Chat und Playlist stehen'
  },
  {
    id: 'watch.comments',
    core: true,
    label: 'Kommentare',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SDCH,
    sel: ['ytd-watch-flexy ytd-comments#comments']
  },
  {
    id: 'watch.description',
    core: true,
    label: 'Beschreibung',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SDC,
    sel: ['ytd-watch-metadata #bottom-row']
  },
  {
    id: 'watch.shortsShelf',
    label: 'Shorts-Regal in Empfehlungen',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SDCH,
    sel: ['ytd-watch-flexy #related ytd-reel-shelf-renderer', 'ytd-watch-flexy #related grid-shelf-view-model', 'ytd-watch-flexy #related ytd-rich-section-renderer:has(a[href^="/shorts/"])']
  },
  {
    id: 'watch.merch',
    label: 'Merch, Tickets, Spenden',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SDCH,
    sel: ['ytd-watch-flexy ytd-merch-shelf-renderer', 'ytd-watch-flexy #ticket-shelf', 'ytd-watch-flexy ytd-ticket-shelf-renderer', 'ytd-watch-flexy #donation-shelf:not(:empty)', 'ytd-watch-flexy ytd-donation-shelf-renderer']
  },
  {
    id: 'watch.ads',
    label: 'Werbe-Kacheln in Empfehlungen',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SH,
    sel: ['ytd-watch-flexy #related ytd-ad-slot-renderer', 'ytd-watch-flexy #player-ads', 'ytd-watch-flexy ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]'],
    note: 'Nur Container, keine Player-Werbung'
  },
  {
    id: 'watch.ambient',
    label: 'Ambient-Glow hinter dem Player',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SH,
    sel: ['ytd-watch-flexy #cinematics', 'ytd-watch-flexy #cinematics-container']
  },
  {
    id: 'watch.playlistPanel',
    label: 'Playlist-Panel',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SDC,
    sel: ['ytd-watch-flexy ytd-playlist-panel-renderer#playlist:not([hidden])']
  },
  {
    id: 'watch.chat',
    label: 'Live-Chat',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SDCH,
    sel: ['ytd-watch-flexy #chat-container:has(ytd-live-chat-frame)', 'ytd-watch-flexy ytd-live-chat-frame']
  },
  {
    id: 'watch.infoCards',
    label: 'Infokarten in der Beschreibung',
    group: 'Videoseite · Bereiche',
    pages: ['watch'],
    modes: SH,
    sel: ['ytd-watch-metadata ytd-video-description-infocards-section-renderer', 'ytd-watch-metadata ytd-horizontal-card-list-renderer']
  },
  {
    id: 'watch.miniplayer',
    label: 'Miniplayer',
    group: 'Videoseite · Bereiche',
    modes: SH,
    sel: ['ytd-miniplayer', 'ytd-app > ytd-miniplayer']
  },

  // videoseite buttons
  {
    id: 'watch.btn.like',
    core: true,
    label: 'Like / Dislike',
    group: 'Videoseite · Buttons',
    pages: ['watch'],
    modes: SDH,
    sel: ['ytd-watch-metadata [data-ytx-btn="like"]']
  },
  {
    id: 'watch.btn.likeCount',
    label: 'Like-Zahl',
    group: 'Videoseite · Buttons',
    pages: ['watch'],
    modes: SH,
    sel: ['ytd-watch-metadata like-button-view-model [class*="ButtonTextContent"]', 'ytd-watch-metadata like-button-view-model [class*="button-text-content"]']
  },
  { id: 'watch.btn.share', core: true, label: 'Teilen', group: 'Videoseite · Buttons', pages: ['watch'], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="share"]'] },
  { id: 'watch.btn.save', label: 'Speichern', group: 'Videoseite · Buttons', pages: ['watch'], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="save"]'] },
  { id: 'watch.btn.download', label: 'Herunterladen', group: 'Videoseite · Buttons', pages: ['watch'], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="download"]'] },
  { id: 'watch.btn.clip', label: 'Clip', group: 'Videoseite · Buttons', pages: ['watch'], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="clip"]'] },
  { id: 'watch.btn.thanks', label: 'Super Thanks', group: 'Videoseite · Buttons', pages: ['watch'], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="thanks"]'] },
  { id: 'watch.btn.ask', label: 'KI-Fragen', group: 'Videoseite · Buttons', pages: ['watch'], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="ask"]'] },
  { id: 'watch.btn.join', label: 'Kanalmitglied werden', group: 'Videoseite · Buttons', pages: ['watch'], modes: SH, sel: ['ytd-watch-metadata #sponsor-button'] },
  { id: 'watch.btn.subscribe', core: true, label: 'Abonnieren', group: 'Videoseite · Buttons', pages: ['watch'], modes: SDH, sel: ['ytd-watch-metadata #subscribe-button'] },
  { id: 'watch.btn.more', core: true, label: 'Menü ⋯', group: 'Videoseite · Buttons', pages: ['watch'], radical: true, modes: SH, sel: ['ytd-watch-metadata #actions ytd-menu-renderer > yt-button-shape#button-shape', 'ytd-watch-metadata #actions ytd-menu-renderer > yt-icon-button#button'] },

  // player
  {
    id: 'player.endscreen',
    label: 'Endbildschirm-Kacheln',
    group: 'Player',
    pages: ['watch'],
    modes: SDH,
    sel: ['#movie_player .ytp-ce-element', '#movie_player .ytp-endscreen-content', '#movie_player .html5-endscreen', '#movie_player .ytp-fullscreen-grid']
  },
  { id: 'player.cards', label: 'Infokarten-Teaser', group: 'Player', pages: ['watch'], modes: SH, sel: ['#movie_player .ytp-cards-teaser', '#movie_player .ytp-cards-button', '#movie_player .iv-drawer'] },
  { id: 'player.pauseOverlay', label: '„Weitere Videos“ beim Pausieren', group: 'Player', modes: SH, sel: ['#movie_player .ytp-pause-overlay', '#movie_player .ytp-pause-overlay-container'] },
  { id: 'player.paidPromo', label: 'Hinweis bezahlte Werbung', group: 'Player', pages: ['watch'], modes: SH, sel: ['#movie_player .ytp-paid-content-overlay'] },
  { id: 'player.watermark', label: 'Kanal-Wasserzeichen', group: 'Player', pages: ['watch'], modes: SDH, sel: ['#movie_player .iv-branding', '#movie_player .branding-img-container', '#movie_player .ytp-branding'] },
  { id: 'player.btn.autoplay', core: true, label: 'Autoplay-Schalter', group: 'Player', pages: ['watch'], modes: SH, sel: ['#movie_player .ytp-autonav-toggle', '#movie_player button:has(> .ytp-autonav-toggle-button-container)', '#movie_player .ytp-autonav-toggle-button-container'] },
  { id: 'player.btn.miniplayer', label: 'Miniplayer-Button', group: 'Player', pages: ['watch'], modes: SH, sel: ['#movie_player .ytp-miniplayer-button'] },
  { id: 'player.btn.cast', core: true, label: 'Cast-Button', group: 'Player', pages: ['watch'], modes: SH, sel: ['#movie_player .ytp-remote-button'] },
  { id: 'player.btn.next', core: true, label: 'Nächstes Video', group: 'Player', pages: ['watch'], modes: SH, sel: ['#movie_player .ytp-next-button'] },
  { id: 'player.btn.theater', core: true, label: 'Kinomodus-Button', group: 'Player', pages: ['watch'], modes: SH, sel: ['#movie_player .ytp-size-button'] },

  // thumbnails
  {
    id: 'thumb.image',
    label: 'Thumbnails',
    group: 'Thumbnails',
    radical: true,
    modes: SDH,
    dim: 'grayscale',
    sel: [
      'ytd-thumbnail:not(ytd-playlist-panel-video-renderer ytd-thumbnail)',
      'yt-thumbnail-view-model',
      'ytd-playlist-thumbnail',
      'ytd-playlist-video-thumbnail-renderer'
    ],
    note: 'Dimmen = Graustufen bis Hover. Aus = nur Titel'
  },
  {
    id: 'thumb.hoverPreview',
    label: 'Vorschau beim Hovern',
    group: 'Thumbnails',
    modes: SH,
    sel: ['ytd-video-preview', '#video-preview', 'ytd-moving-thumbnail-renderer', '#mouseover-overlay', 'yt-thumbnail-view-model animated-thumbnail-overlay-view-model']
  },
  {
    id: 'thumb.badges',
    label: 'Neu- und Qualitäts-Badges',
    group: 'Thumbnails',
    modes: SH,
    sel: ['ytd-badge-supported-renderer.video-badge', 'yt-content-metadata-view-model badge-shape']
  },

  // suche
  {
    id: 'search.shorts',
    label: 'Shorts in Ergebnissen',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    sel: ['ytd-search grid-shelf-view-model:has(a[href^="/shorts/"])', 'ytd-search ytd-reel-shelf-renderer', 'ytd-search ytd-video-renderer:has(a[href^="/shorts/"])', 'ytd-search yt-lockup-view-model:has(a[href^="/shorts/"])']
  },
  {
    id: 'search.peopleAlsoSearch',
    label: '„Leute suchen auch nach“',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    sel: ['ytd-search ytd-horizontal-card-list-renderer', 'ytd-search ytd-search-refinement-card-renderer']
  },
  {
    id: 'search.shelves',
    label: 'Eingestreute Regale',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    sel: ['ytd-search ytd-shelf-renderer', 'ytd-search grid-shelf-view-model:not(:has(a[href^="/shorts/"]))']
  },
  {
    id: 'search.mixes',
    label: 'Mixe / Playlists in Ergebnissen',
    group: 'Suche',
    pages: ['search'],
    modes: SDH,
    sel: ['ytd-search ytd-item-section-renderer yt-lockup-view-model:has(a[href*="start_radio=1"])', 'ytd-search ytd-radio-renderer', 'ytd-search ytd-playlist-renderer']
  },
  {
    id: 'search.ads',
    label: 'Werbung in Ergebnissen',
    group: 'Suche',
    pages: ['search'],
    modes: SH,
    sel: ['ytd-search ytd-ad-slot-renderer', 'ytd-search ytd-promoted-sparkles-web-renderer', 'ytd-search ytd-promoted-video-renderer']
  },

  // kanal
  {
    id: 'channel.shortsTab',
    label: 'Shorts-Tab',
    group: 'Kanal',
    pages: ['channel'],
    modes: SH,
    sel: ['[data-ytx-tab="shorts"]']
  },
  {
    id: 'channel.postsTab',
    label: 'Beiträge-Tab',
    group: 'Kanal',
    pages: ['channel'],
    modes: SH,
    sel: ['[data-ytx-tab="posts"]']
  },
  {
    id: 'channel.shortsShelf',
    label: 'Shorts-Regal auf Startseite des Kanals',
    group: 'Kanal',
    pages: ['channel'],
    modes: SDCH,
    sel: ['ytd-browse[page-subtype="channels"] ytd-item-section-renderer:has(ytd-reel-shelf-renderer)', 'ytd-browse[page-subtype="channels"] ytd-item-section-renderer:has(grid-shelf-view-model a[href^="/shorts/"])', 'ytd-browse[page-subtype="channels"] ytd-rich-section-renderer:has(a[href^="/shorts/"])']
  },
  {
    id: 'channel.trailer',
    label: 'Kanal-Trailer',
    group: 'Kanal',
    pages: ['channel'],
    modes: SDCH,
    sel: ['ytd-browse[page-subtype="channels"] ytd-channel-video-player-renderer']
  },

  // abo feed
  {
    id: 'subs.shorts',
    label: 'Shorts im Abo-Feed',
    group: 'Abo-Feed',
    pages: ['subscriptions'],
    modes: SDCH,
    sel: ['ytd-browse[page-subtype="subscriptions"] ytd-rich-section-renderer:has(a[href^="/shorts/"])', 'ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has(a[href^="/shorts/"])', 'ytd-browse[page-subtype="subscriptions"] ytd-reel-shelf-renderer']
  },
  {
    id: 'subs.live',
    label: 'Live und Premieren im Abo-Feed',
    group: 'Abo-Feed',
    pages: ['subscriptions'],
    modes: SDH,
    sel: ['ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has([data-ytx-live])']
  },

  // playlist
  {
    id: 'playlist.sidebarInfo',
    label: 'Playlist-Beschreibung / Kopf',
    group: 'Playlist',
    pages: ['playlist'],
    modes: SDC,
    sel: ['ytd-browse[page-subtype="playlist"] ytd-playlist-header-renderer', 'ytd-browse[page-subtype="playlist"] yt-page-header-renderer']
  }
]


export const targetById = Object.fromEntries(targets.map((t) => [t.id, t]))

