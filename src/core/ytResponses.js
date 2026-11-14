import { pageWindow } from './bridge.js'

// liest die antworten mit, die youtube beim seitenwechsel und weiterscrollen selbst nachlaedt
// es werden keine eigenen anfragen gestellt

const listeners = new Set()
let hooked = false

function hook() {
  if (hooked) return
  hooked = true
  const w = pageWindow
  const orig = w.fetch
  if (typeof orig !== 'function') return
  w.fetch = function (...a) {
    const p = orig.apply(this, a)
    try {
      const url = String(a[0]?.url || a[0])
      if (listeners.size && /\/youtubei\/v1\/(next|get_watch|browse|search)/.test(url)) {
        p.then((r) => r.clone().json())
          .then((j) => {
            for (const fn of listeners) {
              try { fn(j) } catch {}
            }
          })
          .catch(() => {})
      }
    } catch {}
    return p
  }
}

export function onYtResponse(fn) {
  hook()
  listeners.add(fn)
  return () => listeners.delete(fn)
}
