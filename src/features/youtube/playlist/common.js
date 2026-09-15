import { playlistPage } from '../../../registry/youtube/paths.js'
import { qsa, qsFirst } from '../../../core/dom.js'
import { sleep } from '../../../core/scheduler.js'

// liest playlist eintraege aus beiden komponenten generationen
export function readPlaylist() {
  const polymer = qsa(playlistPage.polymerItems)
  const kind = polymer.length ? 'polymer' : 'lockup'
  const els = kind === 'polymer' ? polymer : qsa(playlistPage.lockupItems)
  const items = []
  for (const el of els) {
    const it = kind === 'polymer' ? playlistPage.readPolymerItem(el) : playlistPage.readLockupItem(el)
    if (it) items.push(it)
  }
  const continuation = findContinuation()
  return { kind, items, total: playlistPage.total(), continuation, complete: !continuation }
}

export function findContinuation() {
  const el = qsFirst(playlistPage.continuation)
  if (!el) return null
  // leere wrapper am ende sind keine nachlade elemente
  if (el.matches('ytd-continuation-item-renderer') || el.querySelector('ytd-continuation-item-renderer, tp-yt-paper-spinner, [class*="Spinner"], yt-spinner, [class*="continuation" i]')) return el
  return null
}

export function summarize(items, { doneThreshold = 90 } = {}) {
  let total = 0
  let watched = 0
  let unavailable = 0
  let live = 0
  let withProgress = 0
  for (const it of items) {
    if (it.live) {
      live++
      continue
    }
    if (it.unavailable || !it.durationSec) {
      unavailable++
      continue
    }
    total += it.durationSec
    if (it.percent != null && it.percent > 0) {
      withProgress++
      watched += it.percent >= doneThreshold ? it.durationSec : (it.durationSec * it.percent) / 100
    }
  }
  return { total, watched, remaining: Math.max(0, total - watched), unavailable, live, withProgress, count: items.length }
}

let loading = null

// loest youtubes eigenes nachladen aus indem das nachlade element sichtbar gescrollt wird
export async function loadAll(onProgress) {
  if (loading) return loading
  loading = (async () => {
    const y0 = window.scrollY
    let stale = 0
    let rounds = 0
    try {
      while (rounds < 200) {
        const before = readPlaylist()
        onProgress?.(before)
        if (!before.continuation) break
        before.continuation.scrollIntoView({ block: 'center' })
        window.dispatchEvent(new Event('scroll'))
        let grew = false
        for (let i = 0; i < 40; i++) {
          await sleep(150)
          const n = readPlaylist().items.length
          if (n > before.items.length) {
            grew = true
            break
          }
          if (!findContinuation()) break
        }
        rounds++
        if (!grew) {
          stale++
          if (stale >= 3) break
          window.scrollBy(0, -200)
          await sleep(200)
        } else {
          stale = 0
        }
      }
    } finally {
      window.scrollTo(0, y0)
    }
    const result = readPlaylist()
    onProgress?.(result)
    return result
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

export function isLoading() {
  return !!loading
}
