import { site } from '../sites/index.js'
import { registerCheck } from '../core/diagnose.js'
import { onDispose } from '../core/lifecycle.js'
import { log } from '../core/log.js'

const running = new Map()
let ctxBase = null

export function initBehavior(ctx) {
  ctxBase = ctx
  onDispose(() => {
    for (const r of running.values()) safeStop(r)
    running.clear()
  })
  registerCheck('behavior', 'Verhalten', 'Verhalten', () =>
    site.behaviors
      .filter((b) => running.has(b.id))
      .map((b) => {
        const r = running.get(b.id)
        const h = b.health ? b.health(ctxBase, r.value) : { status: 'ok', detail: 'aktiv' }
        return { id: `behavior.${b.id}`, label: b.label, ...h }
      })
  )
}

function safeStop(r) {
  try { r.stop?.() } catch (e) { log.error('behavior stop', e) }
}

export function applyBehavior(cfg) {
  for (const b of site.behaviors) {
    const value = cfg.behavior[b.id] ?? b.default
    const active = b.type === 'toggle' ? !!value : !!value
    const r = running.get(b.id)
    if (r && (!active || r.value !== value)) {
      safeStop(r)
      running.delete(b.id)
    }
    if (active && !running.has(b.id)) {
      try {
        const stop = b.start(ctxBase, value)
        running.set(b.id, { stop, value })
      } catch (e) {
        log.error(`behavior ${b.id}`, e)
      }
    }
  }
}
