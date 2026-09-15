import { site } from '../sites/index.js'

const F = () => site.filters
import { compileRules, evaluate } from './filterLogic.js'
import { setCss } from '../core/css.js'
import { h, qsa } from '../core/dom.js'
import { onSweep } from '../core/observer.js'
import { onDispose } from '../core/lifecycle.js'
import { registerCheck } from '../core/diagnose.js'
import { nav } from '../core/nav.js'
import { log } from '../core/log.js'

const ATTR = 'data-ytx-f'
const seen = new WeakMap()
let rules = null
let version = 0
export const filterStats = { page: '', checked: 0, hits: 0, reasons: {}, unreadable: 0 }

const CSS = `
[${ATTR}="hide"] { display: none !important; }
[${ATTR}="dim"]:not([data-ytx-f-open]) { opacity: var(--ytx-dim-opacity, .3) !important; transition: opacity .15s ease !important; }
[${ATTR}="dim"]:not([data-ytx-f-open]):hover { opacity: 1 !important; }
[${ATTR}="collapse"]:not([data-ytx-f-open]) > :not(.ytx-fbar) { display: none !important; }
[${ATTR}="collapse"]:not([data-ytx-f-open]) { min-height: 0 !important; height: auto !important; }
.ytx-fbar { all: initial; display: none; box-sizing: border-box; width: 100%; padding: 6px 10px; margin: 2px 0 6px; border-radius: 8px; cursor: pointer;
  font: 12px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.06)); }
[${ATTR}="collapse"] > .ytx-fbar { display: block; }
[${ATTR}="collapse"][data-ytx-f-open] > .ytx-fbar { opacity: .6; }
[${ATTR}] [${ATTR}] { opacity: 1 !important; }
`

function outermostCards() {
  const out = []
  for (const root of F().activePageRoots()) {
    for (const el of qsa(F().CARD_SELECTORS.join(', '), root)) {
      const parent = el.parentElement?.closest(F().CARD_PARENT)
      if (parent) continue
      out.push(el)
    }
  }
  return out
}

function clearCard(el) {
  el.removeAttribute(ATTR)
  el.removeAttribute('data-ytx-f-reason')
  el.removeAttribute('data-ytx-f-open')
  el.querySelector(':scope > .ytx-fbar')?.remove()
}

function sweep() {
  if (!rules) return
  const f = rules.f
  const active = f.enabled && f.pages.includes(nav.page)
  if (filterStats.page !== nav.url) Object.assign(filterStats, { page: nav.url, checked: 0, hits: 0, reasons: {}, unreadable: 0 })
  if (!active) {
    for (const el of qsa(`[${ATTR}]`)) clearCard(el)
    return
  }
  for (const el of outermostCards()) {
    // youtube recycelt elemente daher signatur aus href und titel
    const a = el.querySelector('a[href]')
    const sig = `${version}|${a?.getAttribute('href') || ''}|${el.querySelector('h3, #video-title')?.textContent || ''}`
    if (seen.get(el) === sig) continue
    seen.set(el, sig)
    let meta = null
    try {
      meta = F().readCard(el)
    } catch (e) {
      log.warn('filter readCard', e)
    }
    filterStats.checked++
    if (!meta || (!meta.title && !meta.videoId)) {
      filterStats.unreadable++
      if (el.hasAttribute(ATTR)) clearCard(el)
      continue
    }
    const reason = evaluate(meta, rules)
    if (!reason) {
      if (el.hasAttribute(ATTR)) clearCard(el)
      continue
    }
    filterStats.hits++
    filterStats.reasons[reason] = (filterStats.reasons[reason] || 0) + 1
    el.setAttribute(ATTR, f.mode)
    el.setAttribute('data-ytx-f-reason', reason)
    let bar = el.querySelector(':scope > .ytx-fbar')
    if (f.mode === 'collapse') {
      if (!bar) {
        bar = h('div', { class: 'ytx-fbar', 'data-ytx-own': '', title: meta.title })
        bar.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          el.toggleAttribute('data-ytx-f-open')
        })
        el.prepend(bar)
      }
      bar.textContent = `Gefiltert (${reason}) · ${meta.channel || ''} – anzeigen`
    } else {
      bar?.remove()
    }
  }
}

export function applyFilters(cfg) {
  rules = compileRules(cfg.filters)
  version++
  sweep()
}

export function initFilters() {
  setCss('filters', CSS)
  onSweep('filters', sweep)
  onDispose(() => {
    for (const el of qsa(`[${ATTR}]`)) clearCard(el)
  })
  registerCheck('filters', 'Filter', 'Filter', () => {
    if (!rules) return { status: 'skip' }
    const f = rules.f
    const res = []
    if (!f.enabled) return { id: 'filters.off', label: 'Filter', status: 'skip', detail: 'ausgeschaltet' }
    if (rules.errors.length) res.push({ id: 'filters.regex', label: 'Ungültige Muster', status: 'fail', detail: rules.errors.join(' · ') })
    const onPage = f.pages.includes(nav.page)
    const reasons = Object.entries(filterStats.reasons).map(([k, v]) => `${k} ${v}`).join(', ')
    res.push({
      id: 'filters.stats',
      label: 'Kacheln auf dieser Seite',
      status: !onPage ? 'skip' : filterStats.checked && filterStats.unreadable / filterStats.checked > 0.5 ? 'warn' : 'ok',
      detail: onPage ? `${filterStats.checked} geprüft · ${filterStats.hits} gefiltert${reasons ? ` (${reasons})` : ''} · ${filterStats.unreadable} nicht lesbar` : 'Filter für diese Seite aus'
    })
    return res
  })
}
