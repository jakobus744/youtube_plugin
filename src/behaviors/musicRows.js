import { navigateEndpoint } from '../registry/music/player.js'

// auf dem handy startet nur das bild eines titels die wiedergabe, ein tipp auf den text daneben tut nichts
// hier gilt die ganze zeile (schnellauswahl, listen) und die ganze karte (regale) als antippbar
// ausgefuehrt wird, was music selbst fuer die zeile vorsieht: der navigationEndpoint der zeile (titel: abspielen, album: oeffnen)
const ROWS = 'ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer'
// diese bereiche haben ihre eigene aktion
const OWN = 'a, button, input, yt-button-shape, tp-yt-paper-icon-button, yt-icon-button, ytmusic-menu-renderer, ytmusic-play-button-renderer, ytmusic-like-button-renderer, ytmusic-thumbnail-renderer, ytmusic-item-thumbnail-overlay-renderer, [role="button"], tp-yt-paper-checkbox, ytmusic-toggle-button-renderer'

export const musicRows = {
  id: 'm.rowTap',
  label: 'Ganze Zeile antippbar (App)',
  description: 'Ein Tipp auf den Text einer Zeile oder Karte (Schnellauswahl, Listen, Regale) startet den Titel oder öffnet das Album, nicht nur der Tipp aufs Bild',
  type: 'toggle',
  default: true,
  start() {
    window.__ytxAppLog?.('ROWTAP start native=' + !!window.__ytxNative)
    if (!window.__ytxNative) return () => {}
    let last = 0
    const onClick = (e) => {
      // ytxdbg
      window.__ytxAppLog?.('ROWTAP click', e.isTrusted, e.target?.localName, e.target?.closest?.(OWN)?.localName || '-', e.target?.closest?.(ROWS)?.localName || '-', !!(e.target?.closest?.(ROWS)?.data))
      if (!e.isTrusted) return
      const t = e.target
      if (!t?.closest || t.closest(OWN)) return
      const row = t.closest(ROWS)
      if (!row) return
      // liegt schon ein eigener link ueber der ganzen zeile, trifft der tipp ihn und music handelt selbst
      const ep = (row.data || row.__data?.data)?.navigationEndpoint
      if (!ep) return
      const now = Date.now()
      if (now - last < 800) return
      last = now
      e.stopPropagation()
      e.preventDefault()
      navigateEndpoint(ep)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }
}
