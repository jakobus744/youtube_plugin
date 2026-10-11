import { pageWindow } from '../core/bridge.js'
import { cleanShareUrl, cleanShareText } from '../core/shareLink.js'

// beim Teilen und Kopieren von YouTube Links verschwindet si= (und pp, feature)
// abgefangen werden die Web Share API, das Kopieren in die Zwischenablage und das Kopieren Ereignis
export const shareClean = {
  id: 'shareClean',
  label: 'Teilen-Link ohne Tracking (si=)',
  description: 'Entfernt si=, pp= und feature= aus Links, die du über „Teilen“ oder „Link kopieren“ weitergibst. Der Zeitpunkt (t=) bleibt',
  type: 'toggle',
  default: true,
  start() {
    const undo = []
    // Methode ersetzen, beim Stoppen wieder auf den Stand davor
    const wrap = (obj, key, make) => {
      if (!obj || typeof obj[key] !== 'function') return
      const orig = obj[key]
      const own = Object.prototype.hasOwnProperty.call(obj, key)
      const fn = make(orig)
      try {
        Object.defineProperty(obj, key, { value: fn, configurable: true, writable: true })
        undo.push(() => {
          if (obj[key] !== fn) return
          if (own) obj[key] = orig
          else delete obj[key]
        })
      } catch {}
    }
    const nav = pageWindow.navigator
    wrap(nav, 'share', (orig) =>
      function (data) {
        if (data && typeof data === 'object') data = { ...data, url: data.url == null ? data.url : cleanShareUrl(data.url), text: cleanShareText(data.text) }
        return orig.call(this, data)
      }
    )
    wrap(nav.clipboard, 'writeText', (orig) =>
      function (text) {
        return orig.call(this, cleanShareText(text))
      }
    )
    // Kopieren aus dem Teilen Fenster (Eingabefeld markieren, execCommand('copy')) und normales Kopieren
    const doc = pageWindow.document
    const onCopy = (e) => {
      try {
        const a = doc.activeElement
        let sel = ''
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && typeof a.value === 'string') sel = a.value.slice(a.selectionStart || 0, a.selectionEnd || 0)
        else sel = String(pageWindow.getSelection?.() || '')
        if (!sel) return
        const cleaned = cleanShareText(sel)
        if (cleaned === sel) return
        e.clipboardData?.setData('text/plain', cleaned)
        e.preventDefault()
      } catch {}
    }
    doc.addEventListener('copy', onCopy, true)
    undo.push(() => doc.removeEventListener('copy', onCopy, true))
    return () => undo.reverse().forEach((f) => f())
  }
}
