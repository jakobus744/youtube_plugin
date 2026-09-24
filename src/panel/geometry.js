import { listen } from '../core/lifecycle.js'
import { debounce } from '../core/scheduler.js'

// fenster verschieben, groesse aendern, immer im sichtbaren bereich halten
// position wird pro seite gespeichert

const MIN_W = 300
const MIN_H = 220
const GAP = 8

export function clampRect(r, vw, vh) {
  const width = Math.max(Math.min(MIN_W, vw - 2 * GAP), Math.min(r.width, vw - 2 * GAP))
  const height = Math.max(Math.min(MIN_H, vh - 2 * GAP), Math.min(r.height, vh - 2 * GAP))
  const left = Math.min(Math.max(GAP, r.left), Math.max(GAP, vw - width - GAP))
  const top = Math.min(Math.max(GAP, r.top), Math.max(GAP, vh - height - GAP))
  return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }
}

export function defaultRect(vw, vh) {
  const width = Math.min(440, vw - 24)
  const top = Math.min(64, Math.max(GAP, vh - MIN_H - GAP))
  return { left: vw - width - 12, top, width, height: vh - top - 12 }
}

export function makeMovable(panel, handle, { load, save }) {
  const vp = () => [document.documentElement.clientWidth || innerWidth, innerHeight]
  let rect = null

  const apply = (r) => {
    rect = clampRect(r, ...vp())
    Object.assign(panel.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, right: 'auto', bottom: 'auto' })
  }
  const place = () => apply(load() || defaultRect(...vp()))

  const persist = debounce(() => rect && save(rect), 300)

  // ziehen an der kopfzeile, aber nicht an eingabefeldern und knoepfen
  let drag = null
  listen(handle, 'pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('select, button, input, a')) return
    drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top }
    handle.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  listen(handle, 'pointermove', (e) => {
    if (!drag) return
    apply({ ...rect, left: drag.left + e.clientX - drag.x, top: drag.top + e.clientY - drag.y })
  })
  const end = () => {
    if (!drag) return
    drag = null
    persist()
  }
  listen(handle, 'pointerup', end)
  listen(handle, 'pointercancel', end)
  listen(handle, 'dblclick', (e) => {
    if (e.target.closest('select, button, input, a')) return
    save(null)
    apply(defaultRect(...vp()))
  })

  // groesse ueber css resize, hier nur mitschreiben
  const ro = new ResizeObserver(() => {
    if (panel.hidden || drag || !rect) return
    const w = panel.offsetWidth
    const h = panel.offsetHeight
    if (Math.abs(w - rect.width) < 2 && Math.abs(h - rect.height) < 2) return
    rect = clampRect({ ...rect, width: w, height: h }, ...vp())
    persist()
  })
  ro.observe(panel)
  listen(window, 'resize', () => rect && !panel.hidden && apply(rect))

  return { place, get rect() { return rect }, stop: () => ro.disconnect() }
}
