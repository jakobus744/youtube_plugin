import { log } from './log.js'
import { sleep } from './scheduler.js'

// laedt seiten der eigenen domain im hintergrund wie ein normaler seitenaufruf
// keine internen api aufrufe, eine anfrage nach der anderen mit abstand
// was aus dem html gelesen wird entscheidet die registry der seite

export function createPageLoader({ extract, cache, minIntervalMs = 1800, maxAgeMs = 24 * 3600 * 1000 }) {
  const stats = { requests: 0, cacheHits: 0, errors: 0, lastError: null, lastUrl: null, lastAt: 0, lastMs: 0, queued: 0, disabled: false }
  const inflight = new Map()
  let chain = Promise.resolve()
  let nextAllowed = 0
  let stopped = false

  async function fetchParsed(path) {
    const wait = nextAllowed - Date.now()
    if (wait > 0) await sleep(wait)
    if (stopped) throw new Error('loader gestoppt')
    nextAllowed = Date.now() + minIntervalMs
    const t0 = performance.now()
    stats.requests++
    stats.lastUrl = path
    const res = await fetch(path, { credentials: 'include', headers: { accept: 'text/html' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const parsed = extract(html)
    stats.lastMs = Math.round(performance.now() - t0)
    stats.lastAt = Date.now()
    if (!parsed) throw new Error('keine seitendaten im html')
    return parsed
  }

  // cacheOnly liefert auch veraltete eintraege, laedt aber nie nach
  async function load(path, { maxAge = maxAgeMs, force = false, cacheOnly = false, transform = (x) => x } = {}) {
    const key = `page:${path}`
    if (!force && cache) {
      try {
        const hit = await cache.get(key)
        if (hit && (cacheOnly || Date.now() - hit.ts < maxAge)) {
          stats.cacheHits++
          return hit.value
        }
      } catch {}
    }
    if (cacheOnly) throw new Error('nicht im cache')
    if (stats.disabled) throw new Error('hintergrund laden deaktiviert')
    if (inflight.has(key)) return inflight.get(key)
    stats.queued++
    const p = (chain = chain.then(async () => {
      try {
        const value = transform(await fetchParsed(path))
        if (cache) await cache.set(key, value).catch(() => {})
        return value
      } catch (e) {
        stats.errors++
        stats.lastError = `${path}: ${e.message}`
        log.warn('pageData', stats.lastError)
        throw e
      } finally {
        stats.queued--
        inflight.delete(key)
      }
    }))
    inflight.set(key, p)
    chain = p.catch(() => {})
    return p
  }

  return {
    stats,
    load,
    stop() {
      stopped = true
    }
  }
}
