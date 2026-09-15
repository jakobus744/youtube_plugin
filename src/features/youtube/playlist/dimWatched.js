import { readPlaylist } from './common.js'
import { playlistPanel } from '../../../registry/youtube/paths.js'
import { qsa } from '../../../core/dom.js'

const ATTR = 'data-ytx-watched'

export default {
  id: 'playlist.dimWatched',
  label: 'Gesehene Videos in Playlists markieren',
  group: 'Playlist',
  description: 'Räumt „Später ansehen“ optisch auf ohne etwas zu löschen',
  pages: ['playlist', 'watch'],
  stability: 'mittel',
  settings: {
    mode: { type: 'select', label: 'Darstellung', options: [['dim', 'Dimmen'], ['hide', 'Ausblenden']], default: 'dim' },
    threshold: { type: 'range', label: 'Ab Fortschritt', min: 10, max: 100, step: 5, unit: '%', default: 90 }
  },
  setup(ctx) {
    let s = ctx.settings
    let marked = 0
    ctx.css(`
[${ATTR}="dim"] { opacity: var(--ytx-dim-opacity, .35) !important; }
[${ATTR}="dim"]:hover { opacity: 1 !important; }
[${ATTR}="hide"] { display: none !important; }`)

    const clearAll = () => {
      for (const el of qsa(`[${ATTR}]`)) el.removeAttribute(ATTR)
    }

    const run = () => {
      marked = 0
      if (ctx.nav.page === 'playlist') {
        for (const it of readPlaylist().items) {
          const on = it.percent != null && it.percent >= s.threshold
          if (on) {
            it.wrapper.setAttribute(ATTR, s.mode)
            marked++
          } else if (it.wrapper.hasAttribute(ATTR)) it.wrapper.removeAttribute(ATTR)
        }
      } else if (ctx.nav.page === 'watch') {
        const d = playlistPanel.read()
        if (!d) return
        const els = playlistPanel.itemElements()
        els.forEach((el, i) => {
          const it = d.items[i]
          const on = it && !it.selected && it.percent != null && it.percent >= s.threshold
          if (on) {
            // im panel nie ausblenden sonst bricht die navigation
            el.setAttribute(ATTR, 'dim')
            marked++
          } else if (el.hasAttribute(ATTR)) el.removeAttribute(ATTR)
        })
      }
    }

    return {
      onSweep: run,
      onPage: run,
      update(next) {
        s = next
        clearAll()
        run()
      },
      dispose() {
        clearAll()
        ctx.css('')
      },
      health: () => ({ status: 'ok', detail: `${marked} Einträge markiert (Fortschritt nur sichtbar wenn angemeldet)` })
    }
  }
}
