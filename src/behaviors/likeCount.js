import { likesFromLabel, formatCount, adjustCount, isPressed } from '../core/dislikes.js'

// Like Knopf: am Rechner und auf dem Handy der Knopf in der Like Gruppe
const BUTTON = 'like-button-view-model button, #segmented-like-button button'

export const likeCount = {
  id: 'likeCount',
  label: 'Like-Anzahl am Daumen',
  description: 'Zeigt die Zahl der Likes neben dem Daumen nach oben. Sie kommt aus der Beschriftung des Knopfs, es wird nichts nach außen geschickt',
  type: 'toggle',
  default: true,
  start(ctx) {
    const clear = () => {
      document.querySelectorAll('.ytx-likes').forEach((span) => {
        const btn = span.closest('button')
        span.remove()
        if (btn) {
          btn.style.removeProperty('width')
          btn.style.removeProperty('padding')
        }
      })
    }
    // Zahl und Zustand beim ersten Lesen je Video, damit ein Druck auf Like sofort zaehlt
    let first = { id: '', n: null, pressed: false }
    const tick = () => {
      if (ctx.nav.page !== 'watch') return
      const btn = document.querySelector(BUTTON)
      if (!btn) return
      // zeigt YouTube die Zahl schon selbst (Rechner), nichts doppelt
      const own = btn.querySelector('.yt-spec-button-shape-next__button-text-content, .ytSpecButtonShapeNextButtonTextContent')
      if (own && own.textContent.trim()) return clear()
      const raw = likesFromLabel(btn.getAttribute('aria-label'))
      const pressed = isPressed(btn)
      if (first.id !== ctx.nav.videoId) first = { id: ctx.nav.videoId, n: raw, pressed }
      const n = adjustCount(first.n, raw, first.pressed, pressed)
      let span = btn.querySelector('.ytx-likes')
      if (n == null) return span && clear()
      const text = formatCount(n, navigator.language)
      if (!span) {
        span = document.createElement('span')
        span.className = 'ytx-likes'
        span.setAttribute('data-ytx-own', '')
        span.style.cssText = 'margin-left:4px;font:500 14px/20px Roboto,Arial,sans-serif;color:inherit;pointer-events:none;white-space:nowrap'
        btn.append(span)
        btn.style.setProperty('width', 'auto', 'important')
        btn.style.setProperty('padding', '0 8px', 'important')
      }
      if (span.textContent !== text) span.textContent = text
    }
    const t = setInterval(tick, 1500)
    tick()
    return () => {
      clearInterval(t)
      clear()
    }
  }
}
