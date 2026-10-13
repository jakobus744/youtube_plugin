import { pageWindow } from '../core/bridge.js'
import { onSweep } from '../core/observer.js'
import { pageFromUrl } from '../registry/youtube/pages.js'

// unter dem Video zeigt YouTube mobil bei den weiteren Videos kein Datum, die Seitendaten enthalten es aber
// gelesen wird aus ytInitialData und aus den Antworten, die YouTube beim Weiterscrollen und Wechseln nachlaedt

const dates = new Map()
const textOf = (t) => (t?.runs ? t.runs.map((r) => r.text).join('') : t?.simpleText || t?.content || '')

export function collectDates(o, d = 0) {
  if (!o || typeof o !== 'object' || d > 60) return
  if (typeof o.videoId === 'string' && o.publishedTimeText) {
    const t = textOf(o.publishedTimeText)
    if (t) dates.set(o.videoId, t)
  }
  if (Array.isArray(o)) for (const x of o) collectDates(x, d + 1)
  else for (const k in o) collectDates(o[k], d + 1)
}

let hooked = false
function hookFetch() {
  if (hooked) return
  hooked = true
  const w = pageWindow
  const orig = w.fetch
  if (typeof orig !== 'function') return
  w.fetch = function (...a) {
    const p = orig.apply(this, a)
    try {
      const url = String(a[0]?.url || a[0])
      if (/\/youtubei\/v1\/(next|get_watch|browse|search)/.test(url)) p.then((r) => r.clone().json()).then((j) => collectDates(j)).catch(() => {})
    } catch {}
    return p
  }
}

const CARDS = 'ytm-watch ytm-video-with-context-renderer, ytm-watch ytm-compact-video-renderer'

export const relatedDates = {
  id: 'relatedDates',
  label: 'Datum bei den Videos unter dem Video',
  description: 'Ergänzt „vor 3 Tagen“ in der Zeile mit Kanal und Aufrufen, wie auf der Startseite. Das Datum kommt aus den Seitendaten von YouTube',
  type: 'toggle',
  default: true,
  start() {
    hookFetch()
    collectDates(pageWindow.ytInitialData)
    let lastInit = pageWindow.ytInitialData
    const run = () => {
      if (pageWindow.ytInitialData !== lastInit) {
        lastInit = pageWindow.ytInitialData
        collectDates(lastInit)
      }
      if (pageFromUrl(location.href) !== 'watch') return
      for (const card of document.querySelectorAll(CARDS)) {
        if (card.querySelector('.ytx-rdate')) continue
        const id = card.querySelector('a[href*="watch?v="]')?.getAttribute('href')?.match(/v=([\w-]{11})/)?.[1]
        const t = id && dates.get(id)
        if (!t) continue
        const by = card.querySelector('ytm-badge-and-byline-renderer')
        if (!by || by.textContent.includes(t)) continue
        const sep = document.createElement('span')
        sep.className = 'ytmBadgeAndBylineRendererSeparator ytx-rdate'
        sep.setAttribute('data-ytx-own', '')
        sep.textContent = '•'
        const item = document.createElement('span')
        item.className = 'ytmBadgeAndBylineRendererItemByline ytx-rdate'
        item.setAttribute('data-ytx-own', '')
        item.textContent = t
        by.append(sep, item)
      }
    }
    const off = onSweep('relatedDates', run)
    run()
    return () => {
      off()
      document.querySelectorAll('.ytx-rdate').forEach((e) => e.remove())
    }
  }
}
