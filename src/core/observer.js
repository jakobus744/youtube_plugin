import { debounce } from './scheduler.js'
import { onDispose } from './lifecycle.js'
import { log } from './log.js'

// ein einziger observer fuer alles damit youtube nicht zig callbacks bekommt
const subs = new Map()
let running = false
export const sweepStats = { runs: 0, lastMs: 0, lastAt: 0 }

export function onSweep(id, fn) {
  subs.set(id, fn)
  return () => subs.delete(id)
}

function sweep() {
  const t0 = performance.now()
  for (const [id, fn] of subs) {
    try { fn() } catch (e) { log.error(`sweep ${id}`, e) }
  }
  sweepStats.runs++
  sweepStats.lastMs = Math.round((performance.now() - t0) * 10) / 10
  sweepStats.lastAt = Date.now()
}

export const requestSweep = debounce(sweep, 120, 600)

export function sweepNow() {
  requestSweep.cancel()
  sweep()
}

export function startObserver() {
  if (running) return
  running = true
  const mo = new MutationObserver((records) => {
    // eigene aenderungen ignorieren sonst endlosschleife
    for (const r of records) {
      const t = r.target
      if (t.nodeType === 1 && t.closest && t.closest('[data-ytx-own]')) continue
      let own = true
      for (const n of r.addedNodes) if (!(n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-ytx-own'))) own = false
      for (const n of r.removedNodes) if (!(n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-ytx-own'))) own = false
      if (!own) return requestSweep()
    }
  })
  mo.observe(document.documentElement, { childList: true, subtree: true })
  // fallback fuer aenderungen ohne childlist
  const iv = setInterval(requestSweep, 2000)
  onDispose(() => {
    mo.disconnect()
    clearInterval(iv)
    requestSweep.cancel()
    running = false
  })
}
