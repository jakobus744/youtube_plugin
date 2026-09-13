import { tagRules } from '../registry/tags.js'
import { onSweep } from '../core/observer.js'
import { registerCheck } from '../core/diagnose.js'
import { onDispose } from '../core/lifecycle.js'
import { qsa } from '../core/dom.js'
import { nav } from '../core/nav.js'

const lastCount = new Map()

function run() {
  for (const r of tagRules) {
    if (r.pages && !r.pages.includes(nav.page)) continue
    lastCount.set(r.id, r.run())
  }
}

export function initTagger() {
  onSweep('tagger', run)
  run()
  onDispose(() => {
    for (const attr of ['data-ytx-btn', 'data-ytx-guide', 'data-ytx-guide-section', 'data-ytx-top', 'data-ytx-tab', 'data-ytx-live']) {
      for (const el of qsa(`[${attr}]`)) el.removeAttribute(attr)
    }
  })
  registerCheck('tagger', 'Grundlagen', 'Tagging', () =>
    tagRules
      .filter((r) => !r.pages || r.pages.includes(nav.page))
      .map((r) => {
        const n = lastCount.get(r.id) ?? 0
        const extra = r.id === 'watch.buttons' ? ` · ${qsa('ytd-watch-metadata [data-ytx-btn]').map((e) => e.getAttribute('data-ytx-btn')).join(', ')}` : ''
        return { id: `tag.${r.id}`, label: r.label, status: n ? 'ok' : r.core ? 'warn' : 'skip', detail: `${n} Elemente getaggt${extra}` }
      })
  )
}
