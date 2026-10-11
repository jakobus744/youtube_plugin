// laeuft im Einbett Player (youtube.com/embed) der Vorschau auf Thumbnails
// der Player zeigt in den ersten Sekunden Teilen, Spaeter ansehen, YouTube Logo, Pause und weitere Videos
// das sind Elemente der Seite im Rahmen, von aussen nicht erreichbar, hier schon
// im Rahmen nutzt YouTube die mobile Oberflaeche (ytm-..., player-controls-...), nicht die Namen des Desktop Players
(function () {
  if (!/^\/embed\//.test(location.pathname)) return
  const css = `
ytm-custom-control, .ytmCustomControlHost, .ytPlayerControlsContainerRendered,
ytm-watch-player-controls, .ytmWatchPlayerControlsHost, .player-controls-content, .player-controls-background-container,
.player-controls-background, .player-controls-bottom, .player-controls-top, .player-controls-middle, .bigbar,
.ytmWatchPlayerControlsBackgroundActionItems, ytm-paid-content-overlay, .ytmPaidContentOverlayHost,
cued-overlay, .ytmCuedOverlayHost, .ytmCuedOverlayPlayButton, video-cover, .ytmVideoCoverHost,
.ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top, .ytp-gradient-bottom, .ytp-pause-overlay,
.ytp-watermark, .ytp-youtube-button, .ytp-share-button, .ytp-watch-later-button, .ytp-large-play-button,
.ytp-endscreen-content, .ytp-ce-element, .ytp-suggested-action, .ytp-info-panel-preview, .ytp-spinner, .ytp-bezel, .ytp-title, .ytp-embed-title { display: none !important; }
html, body { background: transparent !important; overflow: hidden !important; }
`
  const add = () => {
    const s = document.createElement('style')
    s.textContent = css
    ;(document.head || document.documentElement).appendChild(s)
  }
  if (document.head || document.documentElement) add()
  else document.addEventListener('DOMContentLoaded', add, { once: true })
})()
