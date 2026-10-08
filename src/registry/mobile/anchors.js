// wo ytx auf m.youtube.com eigene elemente einfuegt
// gleiche namen wie bei youtube, damit features auf beiden seiten laufen
export const anchors = {
  'top.buttons': {
    label: 'Kopfzeile rechts',
    sel: ['ytm-mobile-topbar-renderer .mobile-topbar-header-content', 'ytm-mobile-topbar-renderer header']
  },
  // die aktionsleiste der handy seite hat keinen platz, ytx bekommt eine eigene zeile darunter
  'watch.actions': {
    label: 'ytx-Leiste unter dem Video',
    sel: ['.ytx-watch-row > .ytx-row-end']
  },
  'watch.titleRow': {
    label: 'Unter dem Videotitel',
    sel: ['ytm-slim-video-information-renderer']
  },
  'player.timeDisplay': {
    label: 'Zeitanzeige im Player',
    // die steuerung liegt auf dem handy neben dem player, nicht darin
    sel: ['.ytwPlayerTimeDisplayTimeChunks > div[dir]', '.ytwPlayerTimeDisplayTimeChunks', '.ytwPlayerTimeDisplayHost']
  },
  'playlist.header': {
    label: 'Playlist-Kopf Statistik',
    sel: ['ytm-browse yt-page-header-view-model yt-content-metadata-view-model', 'ytm-browse yt-page-header-view-model']
  },
  'watch.playlistHeader': {
    label: 'Playlist-Panel Kopf',
    visibleOnly: true,
    sel: ['ytm-playlist-engagement-panel-header']
  },
  'watch.playlistInfo': {
    label: 'Playlist unter dem Video',
    sel: ['ytm-playlist-panel-entry-point .playlist-panel-data', 'ytm-playlist-engagement-panel-header']
  },
  'transcript.panelHeader': {
    label: 'Kopf des Transkript-Panels',
    visibleOnly: true,
    sel: ['ytm-engagement-panel-section-list-renderer[panel-target-id*="transcript"] ytm-engagement-panel-title-header-renderer']
  },
  'subs.feedTop': {
    label: 'Abo-Feed oben',
    visibleOnly: true,
    sel: ['ytm-browse ytm-rich-grid-renderer', 'ytm-browse ytm-section-list-renderer', 'ytm-browse ytm-single-column-browse-results-renderer']
  },
  'channel.headerButtons': {
    label: 'Kanal-Kopf Buttons',
    visibleOnly: true,
    sel: ['ytm-browse yt-page-header-view-model yt-flexible-actions-view-model', 'ytm-browse yt-page-header-renderer yt-flexible-actions-view-model']
  }
}
