import { registerCheck } from '../core/diagnose.js'
import { onDispose } from '../core/lifecycle.js'
import { log } from '../core/log.js'
import { onSweep } from '../core/observer.js'
import { nav } from '../core/nav.js'

// startet und stoppt feature module nach config
// features bekommen einen ctx und liefern ein objekt mit hooks zurueck

const running = new Map()
let manifests = []
let makeCtx = null

function onPage(m) {
  return !m.pages || m.pages.includes(nav.page)
}

function call(inst, hook, ...args) {
  if (!inst?.[hook]) return
  try { inst[hook](...args) } catch (e) { log.error(`feature ${inst.__id} ${hook}`, e) }
}

export function initFeatures(list, ctxFactory) {
  manifests = list
  makeCtx = ctxFactory
  nav.on('page', (page) => {
    for (const [id, r] of running) {
      const m = manifests.find((x) => x.id === id)
      call(r.inst, onPage(m) ? 'onPage' : 'onLeave', page)
    }
  })
  nav.on('video', (videoId) => {
    for (const [id, r] of running) {
      const m = manifests.find((x) => x.id === id)
      if (onPage(m)) call(r.inst, 'onVideo', videoId)
    }
  })
  onSweep('features', () => {
    for (const [id, r] of running) {
      const m = manifests.find((x) => x.id === id)
      if (onPage(m)) call(r.inst, 'onSweep')
    }
  })
  onDispose(() => {
    for (const r of running.values()) {
      call(r.inst, 'dispose')
      r.ctx.cleanup?.()
    }
    running.clear()
  })
  registerCheck('features', 'Features', 'Features', () => {
    const out = []
    for (const m of manifests) {
      const r = running.get(m.id)
      if (!r) continue
      let h = { status: 'ok', detail: 'läuft' }
      if (!onPage(m)) h = { status: 'skip', detail: `nur auf: ${m.pages.join(', ')}` }
      else if (r.inst.health) {
        try { h = r.inst.health() || h } catch (e) { h = { status: 'fail', detail: e.message } }
      }
      out.push({ id: `feature.${m.id}`, label: m.label, ...h })
    }
    return out
  })
}

export function applyFeatures(cfg) {
  for (const m of manifests) {
    const settings = cfg.features[m.id] || { enabled: false }
    const r = running.get(m.id)
    const json = JSON.stringify(settings)
    if (r && (!settings.enabled || r.json !== json)) {
      if (settings.enabled && r.inst.update) {
        r.json = json
        r.ctx.settings = settings
        call(r.inst, 'update', settings)
        continue
      }
      call(r.inst, 'dispose')
      r.ctx.cleanup?.()
      running.delete(m.id)
    }
    if (settings.enabled && !running.has(m.id)) {
      try {
        const ctx = makeCtx(m, settings)
        const inst = m.setup(ctx) || {}
        inst.__id = m.id
        running.set(m.id, { inst, json, ctx })
        if (onPage(m)) {
          call(inst, 'onPage', nav.page)
          if (nav.videoId) call(inst, 'onVideo', nav.videoId)
        }
      } catch (e) {
        log.error(`feature ${m.id} setup`, e)
      }
    }
  }
}

export function featureInstance(id) {
  return running.get(id)?.inst || null
}
