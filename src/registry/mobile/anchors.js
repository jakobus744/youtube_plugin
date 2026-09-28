// wo ytx auf m.youtube.com eigene elemente einfuegt
// gleiche namen wie bei youtube, damit features auf beiden seiten laufen
export const anchors = {
  'top.buttons': {
    label: 'Kopfzeile rechts',
    sel: ['ytm-mobile-topbar-renderer .mobile-topbar-header-content', 'ytm-mobile-topbar-renderer header']
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
