// was auf music.youtube.com ausgeblendet werden kann
// data-ytx-m* attribute setzt der tagger aus registry/music/tags.js

import { SH, SDH, SDCH } from '../shared.js'

export const GROUPS = ['Navigation', 'Werbung & Premium', 'Startseite', 'Entdecken', 'Player', 'Playerleiste', 'Suche', 'Künstlerseite']

export const targets = [
  // navigation
  {
    id: 'm.guide.samples',
    label: 'Samples',
    group: 'Navigation',
    modes: SH,
    sel: ['ytmusic-guide-entry-renderer[data-ytx-mguide="samples"]', 'ytmusic-pivot-bar-item-renderer[data-ytx-mguide="samples"]']
  },
  {
    id: 'm.guide.explore',
    label: 'Entdecken',
    group: 'Navigation',
    modes: SH,
    sel: ['ytmusic-guide-entry-renderer[data-ytx-mguide="explore"]']
  },
  {
    id: 'm.guide.upgrade',
    label: 'Upgrade / Premium',
    group: 'Navigation',
    modes: SH,
    sel: ['ytmusic-guide-entry-renderer[data-ytx-mguide="upgrade"]', 'ytmusic-pivot-bar-item-renderer[data-ytx-mguide="upgrade"]']
  },
  {
    id: 'm.guide.playlists',
    label: 'Playlists in der Seitenleiste',
    group: 'Navigation',
    modes: SDCH,
    sel: ['ytmusic-guide-section-renderer[data-ytx-mguide-section="playlists"]']
  },
  {
    id: 'm.guide.signin',
    label: 'Anmelde-Hinweis in der Seitenleiste',
    group: 'Navigation',
    modes: SH,
    sel: ['ytmusic-guide-signin-promo-renderer']
  },
  {
    id: 'm.nav.cast',
    label: 'Cast-Button',
    group: 'Navigation',
    modes: SH,
    sel: ['ytmusic-nav-bar ytmusic-cast-button', 'ytmusic-nav-bar .cast-button']
  },
  {
    id: 'm.nav.history',
    label: 'Verlaufs-Button oben',
    group: 'Navigation',
    modes: SH,
    sel: ['ytmusic-nav-bar .history-icon-button']
  },

  // werbung und premium
  {
    id: 'm.promo.mealbar',
    label: 'Premium-Hinweisleisten',
    group: 'Werbung & Premium',
    modes: SH,
    sel: ['ytmusic-mealbar-promo-renderer', 'ytmusic-statement-banner-renderer', 'ytmusic-popup-container ytmusic-mealbar-promo-renderer', 'tp-yt-paper-toast:has(ytmusic-notification-action-renderer [data-ytx-mpromo])']
  },
  {
    id: 'm.promo.background',
    label: 'Premium-Werbekarten',
    group: 'Werbung & Premium',
    modes: SH,
    sel: ['ytmusic-background-promo-renderer', 'ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="promo"]', 'ytmusic-message-renderer[data-ytx-mpromo]']
  },
  {
    id: 'm.promo.upsell',
    label: 'Upsell-Dialoge („Hintergrundwiedergabe mit Premium“)',
    group: 'Werbung & Premium',
    modes: SH,
    note: 'Blendet den Dialog nur aus, die Funktion bleibt Premium',
    sel: ['tp-yt-paper-dialog:has(ytmusic-mealbar-promo-renderer)', 'ytmusic-upsell-dialog-renderer', 'tp-yt-paper-dialog:has(ytmusic-upsell-dialog-renderer)']
  },

  // startseite
  {
    id: 'm.home.chips',
    label: 'Stimmungs-Chips oben',
    group: 'Startseite',
    pages: ['home'],
    modes: SDH,
    sel: ['ytmusic-browse-response ytmusic-section-list-renderer > #header ytmusic-chip-cloud-renderer']
  },
  {
    id: 'm.home.podcastChip',
    label: 'Podcast-Chip',
    group: 'Startseite',
    pages: ['home'],
    modes: SH,
    sel: ['ytmusic-chip-cloud-chip-renderer[data-ytx-mchip="podcasts"]']
  },
  {
    id: 'm.home.podcasts',
    label: 'Podcast-Regale',
    group: 'Startseite',
    modes: SDCH,
    sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="podcast"]', 'ytmusic-shelf-renderer[data-ytx-mshelf-kind="podcast"]']
  },
  {
    id: 'm.home.videos',
    label: 'Musikvideo-Regale',
    group: 'Startseite',
    modes: SDCH,
    sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="video"]']
  },
  {
    id: 'm.home.samplesShelf',
    label: 'Samples-/Kurzvideo-Regale',
    group: 'Startseite',
    modes: SDCH,
    sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="samples"]', 'ytmusic-immersive-carousel-shelf-renderer']
  },
  {
    id: 'm.home.playlists',
    label: 'Playlist-Empfehlungen',
    group: 'Startseite',
    pages: ['home'],
    modes: SDCH,
    sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="playlist"]']
  },
  {
    id: 'm.home.background',
    label: 'Großes Hintergrundbild',
    group: 'Startseite',
    modes: SH,
    sel: ['ytmusic-browse-response > #background', 'ytmusic-browse-response #background ytmusic-fullbleed-thumbnail-renderer']
  },

  // entdecken
  {
    id: 'm.explore.newVideos',
    label: 'Neue Musikvideos',
    group: 'Entdecken',
    pages: ['explore'],
    modes: SDCH,
    sel: ['ytmusic-browse-response ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="video"]']
  },
  {
    id: 'm.explore.podcasts',
    label: 'Podcasts auf Entdecken',
    group: 'Entdecken',
    pages: ['explore'],
    modes: SDCH,
    sel: ['ytmusic-browse-response ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="podcast"]']
  },

  // player seite
  {
    id: 'm.player.comments',
    label: 'Kommentare-Tab',
    group: 'Player',
    modes: SH,
    sel: ['ytmusic-player-page tp-yt-paper-tab[data-ytx-mtab="comments"]']
  },
  {
    id: 'm.player.related',
    label: 'Ähnliche-Titel-Tab',
    group: 'Player',
    modes: SH,
    sel: ['ytmusic-player-page tp-yt-paper-tab[data-ytx-mtab="related"]']
  },
  {
    id: 'm.player.avToggle',
    label: 'Titel/Video-Umschalter',
    group: 'Player',
    modes: SH,
    sel: ['ytmusic-player-page ytmusic-av-toggle']
  },
  {
    id: 'm.player.chips',
    label: 'Warteschlangen-Chips (Stimmung/Filter)',
    group: 'Player',
    modes: SDH,
    sel: ['ytmusic-player-queue ytmusic-chip-cloud-renderer', 'ytmusic-tab-renderer ytmusic-chip-cloud-renderer']
  },
  {
    id: 'm.player.video',
    label: 'Video/Albumcover im Player',
    group: 'Player',
    radical: true,
    modes: SDH,
    sel: ['ytmusic-player-page #player', 'ytmusic-player-page #song-image']
  },

  // playerleiste
  {
    id: 'm.bar.volume',
    label: 'Lautstärke-Regler',
    group: 'Playerleiste',
    modes: SH,
    sel: ['ytmusic-player-bar #volume-slider', 'ytmusic-player-bar .volume']
  },
  {
    id: 'm.bar.repeatShuffle',
    label: 'Wiederholen & Zufall',
    group: 'Playerleiste',
    modes: SH,
    sel: ['ytmusic-player-bar .repeat', 'ytmusic-player-bar .shuffle']
  },
  {
    id: 'm.bar.dislike',
    label: 'Dislike-Button',
    group: 'Playerleiste',
    modes: SH,
    sel: ['ytmusic-player-bar ytmusic-like-button-renderer #button-shape-dislike', 'ytmusic-player-bar ytmusic-like-button-renderer .dislike']
  },
  {
    id: 'm.bar.thumbnail',
    label: 'Cover in der Playerleiste',
    group: 'Playerleiste',
    modes: SH,
    sel: ['ytmusic-player-bar .thumbnail-image-wrapper']
  },

  // suche
  {
    id: 'm.search.podcasts',
    label: 'Podcasts & Folgen in der Suche',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    sel: ['ytmusic-shelf-renderer[data-ytx-mshelf-kind="podcast"]', 'ytmusic-responsive-list-item-renderer[data-ytx-mitem="podcast"]', 'ytmusic-responsive-list-item-renderer[data-ytx-mitem="episode"]']
  },
  {
    id: 'm.search.videos',
    label: 'Videos in der Suche',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    sel: ['ytmusic-shelf-renderer[data-ytx-mshelf-kind="video"]']
  },
  {
    id: 'm.search.profiles',
    label: 'Profile in der Suche',
    group: 'Suche',
    pages: ['search'],
    modes: SDCH,
    sel: ['ytmusic-shelf-renderer[data-ytx-mshelf-kind="profile"]', 'ytmusic-responsive-list-item-renderer[data-ytx-mitem="profile"]']
  },

  // kuenstler
  {
    id: 'm.artist.videos',
    label: 'Videos-Regal',
    group: 'Künstlerseite',
    pages: ['artist'],
    modes: SDCH,
    sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="video"]']
  },
  {
    id: 'm.artist.featured',
    label: 'Playlists mit dem Künstler',
    group: 'Künstlerseite',
    pages: ['artist'],
    modes: SDCH,
    sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="playlist"]']
  }
]

export const targetById = Object.fromEntries(targets.map((t) => [t.id, t]))
