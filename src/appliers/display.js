import { targets, targetById, attrName, MODE_LABELS } from '../registry/targets.js'
import { setCss } from '../core/css.js'
import { h, qsa, validSelector } from '../core/dom.js'
import { onSweep } from '../core/observer.js'
import { onDispose } from '../core/lifecycle.js'
import { registerCheck } from '../core/diagnose.js'
import { nav } from '../core/nav.js'

const invalid = new Map()

function scopes(t, mode) {
  const attr = `[${attrName(t.id)}="${mode}"]`
  return t.pages ? t.pages.map((p) => `html[data-ytx-page="${p}"]${attr}`) : [`html${attr}`]
}

// css einmal aus der registry bauen, eine regel pro selektor
// ein kaputter selektor zerstoert so nur sich selbst
export function buildDisplayCss() {
  const out = []
  for (const t of targets) {
    const good = t.sel.filter((s) => {
      const ok = validSelector(s)
      if (!ok) invalid.set(`${t.id} ${s}`, true)
      return ok
    })
    for (const mode of t.modes) {
      if (mode === 'show') continue
      for (const scope of scopes(t, mode)) {
        for (const sel of good) {
          const full = `${scope} ${sel}`
          if (mode === 'hide') out.push(`${full} { display: none !important; }`)
          else if (mode === 'collapse') out.push(`${full}:not([data-ytx-open]) { display: none !important; }`)
          else if (mode === 'dim') {
            if (t.dim === 'grayscale') {
              out.push(`${full} { filter: grayscale(1) contrast(.9) !important; opacity: .75 !important; transition: filter .2s ease, opacity .2s ease !important; }`)
              out.push(`${full}:hover { filter: none !important; opacity: 1 !important; }`)
            } else {
              out.push(`${full} { opacity: var(--ytx-dim-opacity, .3) !important; transition: opacity .15s ease !important; }`)
              out.push(`${full}:hover, ${full}:focus-within { opacity: 1 !important; }`)
            }
          }
        }
        if (t.css?.[mode]) out.push(t.css[mode](scope))
      }
    }
  }
  out.push(`
.ytx-collapse-bar { all: initial; display: flex; align-items: center; gap: 8px; box-sizing: border-box; width: 100%; margin: 8px 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; user-select: none;
  font: 500 13px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.08)); }
.ytx-collapse-bar:hover { color: var(--yt-sys-color-baseline--text-primary, #fff); background: var(--yt-sys-color-baseline--tonal-background, rgba(255,255,255,.12)); }
.ytx-collapse-bar .ytx-arrow { display: inline-block; transition: transform .15s ease; }
.ytx-collapse-bar[data-open] .ytx-arrow { transform: rotate(90deg); }
.ytx-collapse-bar .ytx-hint { margin-left: auto; opacity: .7; font-weight: 400; }`)
  return out.join('\n')
}

let current = {}

export function applyDisplay(cfg) {
  current = cfg.display
  const root = document.documentElement
  for (const t of targets) {
    const name = attrName(t.id)
    const mode = cfg.display[t.id]
    if (mode && mode !== 'show') {
      if (root.getAttribute(name) !== mode) root.setAttribute(name, mode)
    } else if (root.hasAttribute(name)) {
      root.removeAttribute(name)
    }
  }
  syncCollapse()
}

// ---------- einklappen ----------

const bars = new WeakMap()

function onPage(t) {
  return !t.pages || t.pages.includes(nav.page)
}

function syncCollapse() {
  for (const t of targets) {
    const active = current[t.id] === 'collapse' && onPage(t)
    if (!active) {
      for (const bar of qsa(`.ytx-collapse-bar[data-ytx-bar="${t.id}"]`)) bar.remove()
      continue
    }
    const selList = t.sel.filter(validSelector).join(', ')
    for (const el of qsa(selList)) {
      // nur aeusserstes element bekommt eine leiste
      if (el.parentElement?.closest(selList)) continue
      let bar = bars.get(el)
      if (bar && bar.isConnected && bar.nextElementSibling === el) continue
      bar?.remove()
      bar = makeBar(t, el)
      bars.set(el, bar)
      el.before(bar)
    }
  }
}

function makeBar(t, el) {
  const arrow = h('span', { class: 'ytx-arrow', text: '▸' })
  const hint = h('span', { class: 'ytx-hint', text: 'aufklappen' })
  const bar = h('div', { class: 'ytx-collapse-bar', 'data-ytx-own': '', 'data-ytx-bar': t.id, role: 'button', tabindex: '0' }, arrow, h('span', { text: t.label }), hint)
  const toggle = () => {
    const open = !el.hasAttribute('data-ytx-open')
    if (open) {
      el.setAttribute('data-ytx-open', '')
      bar.setAttribute('data-open', '')
    } else {
      el.removeAttribute('data-ytx-open')
      bar.removeAttribute('data-open')
    }
    hint.textContent = open ? 'zuklappen' : 'aufklappen'
    // player und kommentare brauchen ein resize damit youtube neu misst
    window.dispatchEvent(new Event('resize'))
  }
  bar.addEventListener('click', toggle)
  bar.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()))
  if (el.hasAttribute('data-ytx-open')) {
    bar.setAttribute('data-open', '')
    hint.textContent = 'zuklappen'
  }
  return bar
}

export function initDisplay() {
  setCss('display', buildDisplayCss())
  onSweep('display.collapse', syncCollapse)
  onDispose(() => {
    for (const bar of qsa('.ytx-collapse-bar')) bar.remove()
    for (const el of qsa('[data-ytx-open]')) el.removeAttribute('data-ytx-open')
    for (const t of targets) document.documentElement.removeAttribute(attrName(t.id))
  })

  registerCheck('display', 'Anzeige', 'Targets auf dieser Seite', () => {
    const results = []
    if (invalid.size) results.push({ id: 'display.invalid', label: 'Ungültige Selektoren', status: 'fail', detail: Array.from(invalid.keys()).join(' · ') })
    for (const t of targets) {
      if (t.pages && !t.pages.includes(nav.page)) continue
      const n = t.sel.filter(validSelector).reduce((sum, s) => sum + qsa(s).length, 0)
      const mode = current[t.id] || 'show'
      // core targets muessen auf ihrer seite immer existieren, sonst ist der selektor veraltet
      const ready = !t.core || nav.page !== 'watch' || document.querySelector('ytd-watch-metadata #actions ytd-menu-renderer')
      results.push({
        id: `display.${t.id}`,
        label: `${t.group} › ${t.label}`,
        status: n ? 'ok' : t.core && ready ? 'warn' : 'skip',
        detail: `${n} Treffer · Modus ${MODE_LABELS[mode]}${n ? '' : t.core ? ' · sollte immer vorhanden sein – Selektor in registry/targets.js prüfen' : ' · auf dieser Seite nicht vorhanden'}`
      })
    }
    return results
  })
}

export function countMatches(id) {
  const t = targetById[id]
  if (!t) return 0
  return t.sel.filter(validSelector).reduce((sum, s) => sum + qsa(s).length, 0)
}
