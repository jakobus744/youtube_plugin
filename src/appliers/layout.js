import { site } from '../sites/index.js'

const P = () => site.presets
import { setCss } from '../core/css.js'
import { listen, onDispose } from '../core/lifecycle.js'
import { registerCheck } from '../core/diagnose.js'
import { nav } from '../core/nav.js'
import { qs } from '../core/dom.js'

const presetAttr = (page) => `data-ytx-l-${page}`

export function buildPresetCss() {
  const out = []
  for (const p of P().layoutPresets) {
    for (const page of p.pages) out.push(p.css(`html[data-ytx-page="${page}"][${presetAttr(page)}="${p.id}"]`))
  }
  return out.join('\n')
}

let last = ''
let scrollOff = null

export function applyLayout(cfg) {
  const root = document.documentElement
  const pages = new Set(P().layoutPresets.flatMap((p) => p.pages))
  let needResize = false
  for (const page of pages) {
    const id = cfg.layout.presets[page]
    const name = presetAttr(page)
    if (id) {
      if (root.getAttribute(name) !== id) {
        root.setAttribute(name, id)
        needResize ||= !!P().presetById[id]?.resize
      }
    } else if (root.hasAttribute(name)) {
      needResize ||= !!P().presetById[root.getAttribute(name)]?.resize
      root.removeAttribute(name)
    }
  }

  const dyn = []
  for (const [gid, list] of Object.entries(cfg.layout.order)) {
    const g = P().orderGroups[gid]
    if (!g || !list.length) continue
    dyn.push(g.container)
    list.forEach((id, i) => dyn.push(g.item(id, i + 1)))
  }
  const tb = P().topbarCss || {}
  if (cfg.layout.topbar && tb[cfg.layout.topbar]) dyn.push(tb[cfg.layout.topbar])
  const text = dyn.join('\n')
  if (text !== last) {
    setCss('layout.dynamic', text)
    last = text
  }

  if (cfg.layout.topbar === 'autohide' && !scrollOff) {
    let y = window.scrollY
    scrollOff = listen(window, 'scroll', () => {
      const ny = window.scrollY
      if (Math.abs(ny - y) < 8) return
      if (ny > y && ny > 120) root.setAttribute('data-ytx-scrolled-down', '')
      else root.removeAttribute('data-ytx-scrolled-down')
      y = ny
    }, { passive: true })
  } else if (cfg.layout.topbar !== 'autohide' && scrollOff) {
    scrollOff()
    scrollOff = null
    root.removeAttribute('data-ytx-scrolled-down')
  }

  // youtube misst player groesse per js neu
  if (needResize) setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
}

export function initLayout(getConfig) {
  setCss('layout.presets', buildPresetCss())
  onDispose(() => {
    for (const a of Array.from(document.documentElement.attributes)) if (a.name.startsWith('data-ytx-l-') || a.name === 'data-ytx-scrolled-down') document.documentElement.removeAttribute(a.name)
  })
  registerCheck('layout', 'Layout', 'Layout', () => {
    const cfg = getConfig()
    const res = []
    const id = cfg.layout.presets[nav.page]
    res.push({ id: 'layout.preset', label: `Preset auf dieser Seite (${nav.page})`, status: id ? 'ok' : 'skip', detail: id ? P().presetById[id]?.label : 'keins' })
    if (cfg.layout.order['watch.actions'] && nav.page === 'watch') {
      const ok = !!qs('ytd-watch-metadata #actions ytd-menu-renderer [data-ytx-btn]')
      res.push({ id: 'layout.order', label: 'Reihenfolge Aktionsleiste', status: ok ? 'ok' : 'warn', detail: ok ? 'Buttons getaggt, Reihenfolge aktiv' : 'Keine getaggten Buttons gefunden' })
    }
    if (nav.page === 'watch' && id && P().presetById[id]?.resize) {
      const video = qs('#movie_player video')
      const primary = qs('ytd-watch-flexy #primary')
      if (video && primary) {
        const vw = video.getBoundingClientRect().width
        const pw = primary.getBoundingClientRect().width
        res.push({ id: 'layout.player', label: 'Playergröße passt zum Layout', status: vw > 0 && vw <= pw + 40 ? 'ok' : 'warn', detail: `Video ${Math.round(vw)} px · Spalte ${Math.round(pw)} px` })
      }
    }
    return res
  })
}
