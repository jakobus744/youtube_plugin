// wo ytx auf music eigene elemente einfuegt
// top.buttons gleicher name wie bei youtube damit der panel button ueberall passt
export const anchors = {
  'top.buttons': {
    label: 'Kopfzeile rechts',
    sel: ['ytmusic-nav-bar #right-content', 'ytmusic-nav-bar .right-content']
  },
  'm.bar.right': {
    label: 'Playerleiste rechts',
    sel: ['ytmusic-player-bar .right-controls-buttons', 'ytmusic-player-bar #right-controls']
  },
  'm.bar.info': {
    label: 'Playerleiste Titelinfo',
    sel: ['ytmusic-player-bar .content-info-wrapper', 'ytmusic-player-bar .middle-controls']
  },
  'm.bar.middleButtons': {
    label: 'Playerleiste neben Like',
    sel: ['ytmusic-player-bar .middle-controls-buttons']
  },
  'm.player.tabs': {
    label: 'Tab-Leiste im Player',
    sel: ['ytmusic-player-page tp-yt-paper-tabs.tab-header-container', 'ytmusic-player-page #side-panel tp-yt-paper-tabs']
  },
  'm.player.tabContent': {
    label: 'Tab-Inhalt im Player',
    sel: ['ytmusic-player-page ytmusic-tab-renderer#tab-renderer']
  },
  'm.queue.top': {
    label: 'Warteschlange oben',
    sel: ['ytmusic-player-page ytmusic-player-queue', 'ytmusic-player-page #queue']
  },
  'm.lyrics': {
    label: 'Songtext im Player',
    visibleOnly: true,
    sel: ['ytmusic-player-page ytmusic-tab-renderer ytmusic-description-shelf-renderer', 'ytmusic-player-page ytmusic-tab-renderer ytmusic-message-renderer']
  },
  'm.browse.top': {
    label: 'Seitenanfang (Startseite, Entdecken)',
    visibleOnly: true,
    sel: ['ytmusic-browse-response:not([hidden]) ytmusic-section-list-renderer > #contents', 'ytmusic-browse-response:not([hidden]) #content-wrapper']
  },
  'm.header.buttons': {
    label: 'Kopfbereich Künstler/Album/Playlist',
    visibleOnly: true,
    sel: [
      'ytmusic-browse-response:not([hidden]) ytmusic-responsive-header-renderer .action-buttons',
      'ytmusic-browse-response:not([hidden]) ytmusic-immersive-header-renderer .buttons',
      'ytmusic-browse-response:not([hidden]) ytmusic-visual-header-renderer .buttons',
      'ytmusic-browse-response:not([hidden]) ytmusic-detail-header-renderer .buttons'
    ]
  },
  'm.header.title': {
    label: 'Titel im Kopfbereich',
    visibleOnly: true,
    sel: [
      'ytmusic-browse-response:not([hidden]) ytmusic-responsive-header-renderer .strapline',
      'ytmusic-browse-response:not([hidden]) ytmusic-responsive-header-renderer h1',
      'ytmusic-browse-response:not([hidden]) ytmusic-immersive-header-renderer h1',
      'ytmusic-browse-response:not([hidden]) ytmusic-visual-header-renderer h1'
    ]
  },
  'm.search.top': {
    label: 'Suchergebnisse oben',
    visibleOnly: true,
    sel: ['ytmusic-search-page ytmusic-tabbed-search-results-renderer', 'ytmusic-search-page #contents']
  }
}
