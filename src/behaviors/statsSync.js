import { cloudReady } from '../core/cloudSync.js'
import { site } from '../sites/index.js'
import { pushHistory } from '../features/stats/data.js'
import { closeFull } from '../features/stats/view.js'

// verlauf dieses geraets regelmaessig in die nextcloud legen, damit die statistik auf anderen geraeten alles zeigt

const EVERY = 6 * 3600 * 1000
const key = () => `ytx.statsPush.${site.id}`

function last() {
  try {
    return Number(localStorage.getItem(key())) || 0
  } catch {
    return 0
  }
}

export const statsSync = {
  id: 'statsSync',
  label: 'Statistik über Nextcloud abgleichen',
  description: 'Legt Schauzeit und Hörverlauf dieses Geräts alle 6 Stunden in der Nextcloud ab (ytx/history), damit die Statistik auf allen Geräten alles zeigt. Nur wenn die Nextcloud im Tab Profile eingerichtet ist',
  type: 'toggle',
  default: true,
  start() {
    const state = { at: last(), error: null, pushed: null }
    const t = setTimeout(async () => {
      if (!cloudReady() || Date.now() - state.at < EVERY) return
      try {
        state.pushed = await pushHistory()
        state.at = Date.now()
        try {
          localStorage.setItem(key(), String(state.at))
        } catch {}
      } catch (e) {
        state.error = e.message
      }
    }, 60000)
    statsSync.state = state
    return () => {
      clearTimeout(t)
      closeFull()
    }
  },
  health() {
    const s = statsSync.state
    if (!cloudReady()) return { status: 'skip', detail: 'Nextcloud nicht eingerichtet' }
    if (s?.error) return { status: 'warn', detail: s.error }
    return { status: 'ok', detail: s?.at ? `zuletzt ${new Date(s.at).toLocaleString('de-DE')}` : 'noch nicht abgeglichen' }
  }
}
