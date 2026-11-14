import { pageWindow } from '../core/bridge.js'
import { listen } from '../core/lifecycle.js'
import { onYtResponse } from '../core/ytResponses.js'
import { pageFromUrl } from '../registry/youtube/pages.js'

// die mobile seite zeigt beim spulen keinen graph der meistgesehenen stellen, die seitendaten enthalten ihn aber

const maps = new Map()

function find(o, key, d = 0) {
  if (!o || typeof o !== 'object' || d > 40) return undefined
  if (!Array.isArray(o) && o[key] !== undefined) return o[key]
  for (const k in o) {
    const hit = find(o[k], key, d + 1)
    if (hit !== undefined) return hit
  }
  return undefined
}

// liefert { id, points } oder null, points sind werte von 0 bis 1 in zeitlicher reihenfolge
export function extractHeatmap(json) {
  const raw = find(json, 'heatMarkers')
  if (!Array.isArray(raw) || raw.length < 2) return null
  const points = raw
    .map((m) => m?.heatMarkerRenderer || m)
    .map((m) => ({ t: Number(m?.timeRangeStartMillis ?? m?.startMillis) || 0, v: Number(m?.heatMarkerIntensityScoreNormalized ?? m?.intensityScoreNormalized) }))
    .filter((p) => Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t)
    .map((p) => Math.min(1, Math.max(0, p.v)))
  if (points.length < 2) return null
  const id = find(find(json, 'currentVideoEndpoint'), 'videoId')
  return { id: typeof id === 'string' ? id : null, points }
}

// weiche flaeche wie bei youtube, x von 0 bis w, hohe werte oben
export function heatmapPath(points, w, h) {
  const n = points.length
  const x = (i) => (i / (n - 1)) * w
  // wurzel hebt die flachen stellen an, sonst bleibt bei einer einzelnen spitze nur ein strich
  const y = (v) => h - Math.max(0.04, Math.sqrt(v)) * h
  let d = `M0,${h} L0,${y(points[0]).toFixed(1)}`
  for (let i = 1; i < n; i++) {
    const mx = ((x(i - 1) + x(i)) / 2).toFixed(1)
    d += ` C${mx},${y(points[i - 1]).toFixed(1)} ${mx},${y(points[i]).toFixed(1)} ${x(i).toFixed(1)},${y(points[i]).toFixed(1)}`
  }
  return `${d} L${w},${h} Z`
}

// die breiteste leiste unter dem finger, die gespielte teilstrecke ist schmaler
export function progressBarOf(el) {
  let best = null
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.id === 'movie_player') break
    const name = `${e.tagName} ${typeof e.className === 'string' ? e.className : ''}`
    if (/progress.?bar|scrubber|timebar|seek/i.test(name)) {
      const w = e.getBoundingClientRect().width
      if (!best || w > best.w) best = { el: e, w }
    }
  }
  return best && best.w > 60 ? best.el : null
}

const currentId = () => new URLSearchParams(location.search).get('v')

function collect(json) {
  const h = extractHeatmap(json)
  if (!h) return
  const id = h.id || currentId()
  if (!id) return
  maps.set(id, h.points)
  // nur die letzten videos merken
  if (maps.size > 30) maps.delete(maps.keys().next().value)
}

// gleiche hoehe wie der graph von youtube
const H = 40

export const heatmap = {
  id: 'heatmap',
  label: 'Graph der meistgesehenen Stellen beim Spulen',
  description: 'Zeigt beim Berühren der Zeitleiste über der Leiste, welche Stellen des Videos am häufigsten angesehen wurden. Die Werte kommen aus den Seitendaten von YouTube, nicht jedes Video hat welche',
  type: 'toggle',
  default: true,
  start() {
    let lastInit = null
    const readInit = () => {
      const init = pageWindow.ytInitialData
      if (init && init !== lastInit) {
        lastInit = init
        collect(init)
      }
    }
    readInit()
    const offData = onYtResponse(collect)
    let box = null
    let hideTimer = 0
    let showTimer = 0
    const hide = () => {
      box?.remove()
      box = null
    }
    const show = (bar) => {
      readInit()
      const points = maps.get(currentId())
      // die leiste liegt in einer ebene ueber dem player, dort am naechsten positionierten vorfahren einhaengen
      let mp = bar.parentElement
      while (mp && mp !== document.body && getComputedStyle(mp).position === 'static') mp = mp.parentElement
      if (!points || !mp) return
      clearTimeout(hideTimer)
      hide()
      const b = bar.getBoundingClientRect()
      const p = mp.getBoundingClientRect()
      const ns = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(ns, 'svg')
      svg.setAttribute('data-ytx-own', '')
      svg.setAttribute('viewBox', `0 0 1000 ${H}`)
      svg.setAttribute('preserveAspectRatio', 'none')
      // youtube gibt svg in der leiste eigene masse vor, deshalb mit vorrang setzen
      svg.style.cssText = `position:absolute !important;left:${b.left - p.left}px !important;top:${b.top - p.top - H - 2}px !important;width:${b.width}px !important;height:${H}px !important;max-height:none !important;transform:none !important;z-index:70;pointer-events:none;opacity:.6;visibility:hidden;`
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', heatmapPath(points, 1000, H))
      path.setAttribute('fill', 'rgba(255,255,255,.55)')
      svg.append(path)
      mp.append(svg)
      box = svg
      // youtube blendet seinen eigenen graph erst beim ziehen ein, der eigene springt nur ein, wenn der fehlt
      clearTimeout(showTimer)
      showTimer = setTimeout(() => {
        if (box !== svg) return
        const own = [...document.querySelectorAll('yt-progress-bar-heatseeker')].some((e) => e.getBoundingClientRect().height > 4)
        if (own) hide()
        else svg.style.visibility = 'visible'
      }, 220)
    }
    const offs = [
      listen(document, 'touchstart', (e) => {
        if (e.touches.length !== 1 || pageFromUrl(location.href) !== 'watch') return
        const bar = progressBarOf(e.target)
        if (bar) show(bar)
      }, { passive: true, capture: true }),
      listen(document, 'touchend', () => {
        if (box) hideTimer = setTimeout(hide, 700)
      }, { passive: true, capture: true }),
      listen(document, 'touchcancel', hide, { passive: true, capture: true })
    ]
    return () => {
      clearTimeout(hideTimer)
      clearTimeout(showTimer)
      hide()
      offData()
      offs.forEach((off) => off())
    }
  }
}
