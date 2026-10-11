import { gmJson, hasGmRequest } from '../features/music/metadataProviders/http.js'
import { API, parseVotes, formatCount } from '../core/dislikes.js'

// Dislike Button: am Rechner und auf dem Handy der zweite Knopf der Like Gruppe
const BUTTON = 'dislike-button-view-model button, #segmented-dislike-button button, ytm-slim-video-action-bar-renderer like-button-view-model + * button'

export const dislikeCount = {
  id: 'dislikeCount',
  label: 'Dislike-Anzahl (Return YouTube Dislike)',
  description: 'Zeigt die Zahl der Dislikes neben dem Daumen nach unten. Die Video-ID wird dafür an returnyoutubedislikeapi.com geschickt (Dienst von Dritten, Schätzwert aus Nutzerdaten)',
  type: 'toggle',
  default: false,
  start(ctx) {
    const cache = new Map()
    let busy = false
    const render = (v) => {
      const btn = document.querySelector(BUTTON)
      if (!btn) return
      let span = btn.querySelector('.ytx-dislikes')
      if (!v) {
        if (span) {
          span.remove()
          btn.style.removeProperty('width')
          btn.style.removeProperty('padding')
        }
        return
      }
      const text = formatCount(v.dislikes, navigator.language)
      if (!span) {
        span = document.createElement('span')
        span.className = 'ytx-dislikes'
        span.setAttribute('data-ytx-own', '')
        span.style.cssText = 'margin-left:4px;font:500 14px/20px Roboto,Arial,sans-serif;color:inherit;pointer-events:none;white-space:nowrap'
        btn.append(span)
        btn.style.setProperty('width', 'auto', 'important')
        btn.style.setProperty('padding', '0 8px', 'important')
      }
      if (span.textContent !== text) span.textContent = text
    }
    const tick = async () => {
      if (ctx.nav.page !== 'watch') return
      const id = ctx.nav.videoId
      if (!id) return
      if (!cache.has(id) && !busy && hasGmRequest()) {
        busy = true
        cache.set(id, null)
        try {
          cache.set(id, parseVotes(await gmJson(API + encodeURIComponent(id), { timeout: 8000 })))
        } catch {
          cache.set(id, null)
        }
        busy = false
      }
      render(cache.get(id))
    }
    const t = setInterval(tick, 1500)
    tick()
    return () => {
      clearInterval(t)
      document.querySelectorAll('.ytx-dislikes').forEach((e) => e.remove())
    }
  },
  health: () => ({ status: hasGmRequest() ? 'ok' : 'warn', detail: hasGmRequest() ? 'Anfragen über den Userscript-Manager möglich' : 'GM_xmlhttpRequest fehlt' })
}
