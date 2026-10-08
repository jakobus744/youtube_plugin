import { behaviors as yt } from './youtube.js'
import { listen } from '../core/lifecycle.js'
import { pageFromUrl } from '../registry/youtube/pages.js'

// verhalten fuer m.youtube.com
// umleitungen arbeiten mit urls, der rest mit der player api, beides gibt es auch mobil

const SHARED = ['shortsRedirect', 'homeRedirect', 'autoplayOff', 'forceQuality', 'speedMemory', 'pauseOnBlur', 'channelTrailerPause']

// video nach unten wischen bringt zur vorherigen seite zurueck, wie das herunterziehen in der youtube app
const swipeDownBack = {
  id: 'swipeDownBack',
  label: 'Video nach unten wischen, um zu verkleinern',
  description: 'Wie in der YouTube-App: Das Video nach unten ziehen bringt dich zur vorherigen Seite zurück. In der ytx-App läuft das Video dabei klein unten rechts weiter, antippen holt es zurück. Nicht im Vollbild und nicht an der Zeitleiste',
  type: 'toggle',
  default: true,
  start() {
    let t0 = null
    const inPlayer = (el) => !!el?.closest?.('#movie_player, ytm-custom-control, #player-container-id, .player-container')
    const full = () => !!document.fullscreenElement || document.body?.getAttribute('faux-fullscreen') === 'true'
    const offs = [
      listen(document, 'touchstart', (e) => {
        t0 = null
        if (e.touches.length !== 1 || pageFromUrl(location.href) !== 'watch' || full() || !inPlayer(e.target)) return
        const box = (e.target.closest('#movie_player, ytm-custom-control') || e.target).getBoundingClientRect()
        const y = e.touches[0].clientY
        // untere kante gehoert der zeitleiste
        if (box.height && y > box.bottom - 40) return
        t0 = { x: e.touches[0].clientX, y, at: Date.now(), done: false }
      }, { passive: true, capture: true }),
      listen(document, 'touchmove', (e) => {
        if (!t0 || t0.done || e.touches.length !== 1) return
        const dx = e.touches[0].clientX - t0.x
        const dy = e.touches[0].clientY - t0.y
        if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) t0 = null
        else if (dy > 55 && dy > Math.abs(dx) * 1.1 && Date.now() - t0.at < 1500) {
          t0.done = true
          // in der app wird das video klein weitergespielt, sonst geht es nur zurueck
          if (window.__ytxNative) window.__ytxNative({ a: 'minimize' })
          else history.back()
        } else if (dy < -70 && -dy > Math.abs(dx) * 1.2 && Date.now() - t0.at < 1500) {
          // nach oben wischen: vollbild, wie in der youtube app
          t0.done = true
          document.querySelector('#movie_player')?.toggleFullscreen?.()
        }
      }, { passive: true, capture: true })
    ]
    return () => offs.forEach((off) => off())
  }
}

export const behaviors = [...yt.filter((b) => SHARED.includes(b.id)), swipeDownBack]

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
