import { h } from '../../core/dom.js'
import { formatDuration } from '../../core/format.js'
import { SRC_COLOR, catColors, catLabel } from './colors.js'

// grafik bausteine als svg und html, ohne fremde bibliotheken

const NS = 'http://www.w3.org/2000/svg'
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v))
  for (const c of kids.flat()) if (c) el.append(c)
  return el
}
const title = (text) => s('title', {}, document.createTextNode(text))

export const mins = (sec) => formatDuration(sec)

// gestapelte balken je zeitabschnitt, youtube unten, music oben
export function stackedBars(bars, { srcs = ['yt', 'music'], onPick } = {}) {
  const W = 320
  const H = 110
  const n = bars.length || 1
  const gap = n > 40 ? 1 : 3
  const bw = Math.max(2, (W - gap * (n - 1)) / n)
  const max = Math.max(60, ...bars.map((b) => srcs.reduce((t, k) => t + (b[k] || 0), 0)))
  const svg = s('svg', { viewBox: `0 0 ${W} ${H + 16}`, class: 'chart', role: 'img' })
  bars.forEach((b, i) => {
    const x = i * (bw + gap)
    let y = H
    const total = srcs.reduce((t, k) => t + (b[k] || 0), 0)
    const g = s('g', { class: onPick ? 'pick' : null }, title(`${b.label}: ${mins(total)}${srcs.length > 1 ? ` (YouTube ${mins(b.yt || 0)}, Music ${mins(b.music || 0)})` : ''}`))
    if (!total) g.append(s('rect', { x, y: H - 2, width: bw, height: 2, fill: 'currentColor', opacity: 0.18 }))
    for (const k of srcs) {
      const hgt = ((b[k] || 0) / max) * H
      if (!hgt) continue
      y -= hgt
      g.append(s('rect', { x, y, width: bw, height: Math.max(1, hgt), rx: 1.5, fill: SRC_COLOR[k] }))
    }
    if (onPick) g.addEventListener('click', () => onPick(b))
    svg.append(g)
  })
  // beschriftung: erster, mittlerer, letzter abschnitt
  const marks = n <= 8 ? bars.map((_, i) => i) : [0, Math.floor(n / 2), n - 1]
  for (const i of marks) {
    const anchor = n <= 8 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
    const x = anchor === 'start' ? 0 : anchor === 'end' ? W : i * (bw + gap) + bw / 2
    const t = s('text', { x, y: H + 12, 'text-anchor': anchor, class: 'axis' })
    t.textContent = bars[i]?.label || ''
    svg.append(t)
  }
  return svg
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// wochentag x stunde, deckkraft nach zeit
export function heatmap(grid, color) {
  const cw = 12
  const ch = 12
  const L = 20
  const svg = s('svg', { viewBox: `0 0 ${L + 24 * cw} ${7 * ch + 14}`, class: 'chart', role: 'img' })
  const max = Math.max(1, ...grid.flat())
  grid.forEach((row, d) => {
    const t = s('text', { x: 0, y: d * ch + 9, class: 'axis' })
    t.textContent = WD[d]
    svg.append(t)
    row.forEach((v, hr) => {
      svg.append(s('rect', { x: L + hr * cw + 0.5, y: d * ch + 0.5, width: cw - 1, height: ch - 1, rx: 2, fill: v ? color : 'currentColor', opacity: v ? 0.15 + 0.85 * Math.sqrt(v / max) : 0.06 }, title(`${WD[d]} ${hr}–${hr + 1} Uhr: ${mins(v)}`)))
    })
  })
  for (const hr of [0, 6, 12, 18]) {
    const t = s('text', { x: L + hr * cw, y: 7 * ch + 11, class: 'axis' })
    t.textContent = `${hr}`
    svg.append(t)
  }
  return svg
}

// anteile als ein gestapelter balken mit legende
export function shareBar(cats, { onPick } = {}) {
  const bar = h('div', { class: 'share' })
  const legend = h('div', { class: 'legend' })
  const colors = catColors(cats.list.map((c) => c.name))
  for (const c of cats.list) {
    const color = colors.get(c.name)
    const label = catLabel(c.name)
    bar.append(h('span', { title: `${label}: ${Math.round(c.share * 100)} %`, style: { flex: `${c.share} 0 0`, background: color } }))
    const item = h('button', { type: 'button', class: 'leg', disabled: c.other || !onPick }, h('i', { style: { background: color } }), `${label} `, h('small', { text: `${Math.round(c.share * 100)} %` }))
    if (onPick && !c.other) item.addEventListener('click', () => onPick(c.name))
    legend.append(item)
  }
  return h('div', null, bar, legend)
}

// rangliste mit balken in der grundfarbe und trend gegenueber dem zeitraum davor
export function rankList(list, { color, onPick, sub } = {}) {
  const max = Math.max(1, ...list.map((x) => x.sec))
  return h('ol', { class: 'rank' }, ...list.map((x) => {
    let trend = null
    if (x.prevPlace == null && x.place) trend = h('span', { class: 'tr new', text: 'neu' })
    else if (x.prevPlace && x.prevPlace > x.place) trend = h('span', { class: 'tr up', text: `▲${x.prevPlace - x.place}` })
    else if (x.prevPlace && x.prevPlace < x.place) trend = h('span', { class: 'tr down', text: `▼${x.place - x.prevPlace}` })
    const row = h('li', { class: onPick ? 'pick' : null },
      h('div', { class: 'rl' }, h('span', { class: 'nm', text: x.name }), trend, h('span', { class: 'val', text: mins(x.sec) })),
      sub ? h('small', { text: sub(x) }) : null,
      h('div', { class: 'rb' }, h('span', { style: { width: `${(x.sec / max) * 100}%`, background: color } }))
    )
    if (onPick) row.addEventListener('click', () => onPick(x))
    return row
  }))
}

// zehn faecher: an welcher stelle uebersprungen oder abgebrochen
export function skipBins(bins, color) {
  const max = Math.max(1, ...bins)
  const svg = s('svg', { viewBox: '0 0 200 60', class: 'chart small', role: 'img' })
  bins.forEach((v, i) => {
    const hgt = (v / max) * 44
    svg.append(s('rect', { x: i * 20 + 1, y: 46 - hgt, width: 18, height: Math.max(1, hgt), rx: 2, fill: color, opacity: v ? 1 : 0.2 }, title(`${i * 10}–${i * 10 + 10} %: ${v}`)))
  })
  for (const [x, l] of [[1, '0 %'], [100, '50 %'], [199, '100 %']]) {
    const t = s('text', { x, y: 58, 'text-anchor': x > 150 ? 'end' : x > 50 ? 'middle' : 'start', class: 'axis' })
    t.textContent = l
    svg.append(t)
  }
  return svg
}

// stunden des tages fuer die detailansicht
export function hourBars(hours, color) {
  const max = Math.max(1, ...hours)
  const svg = s('svg', { viewBox: '0 0 240 56', class: 'chart small', role: 'img' })
  hours.forEach((v, i) => {
    const hgt = (v / max) * 40
    svg.append(s('rect', { x: i * 10 + 0.5, y: 42 - hgt, width: 9, height: Math.max(1, hgt), rx: 1.5, fill: color, opacity: v ? 1 : 0.2 }, title(`${i}–${i + 1} Uhr: ${mins(v)}`)))
  })
  for (const hr of [0, 6, 12, 18, 23]) {
    const t = s('text', { x: hr * 10 + 4, y: 54, 'text-anchor': 'middle', class: 'axis' })
    t.textContent = `${hr}`
    svg.append(t)
  }
  return svg
}

export const CHART_CSS = `
.chart { width: 100%; height: auto; display: block; color: var(--fg2); overflow: visible; }
.chart .axis { font-size: 8px; fill: var(--fg2); }
.chart.small { max-width: 360px; }
.chart .pick { cursor: pointer; }
.share { display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin: 6px 0; gap: 1px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.leg { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; color: var(--fg); padding: 2px 0; font: inherit; cursor: pointer; }
.leg[disabled] { cursor: default; }
.leg i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.leg small, .rank small { color: var(--fg2); }
.rank { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rank li.pick { cursor: pointer; }
.rank .rl { display: flex; align-items: baseline; gap: 6px; }
.rank .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank .val { color: var(--fg2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rank .rb { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--fg2) 18%, transparent); margin-top: 2px; }
.rank .rb span { display: block; height: 100%; border-radius: 2px; }
.tr { font-size: 10px; font-weight: 600; }
.tr.up { color: #3fbf5f; }
.tr.down { color: #ff5a4f; }
.tr.new { color: var(--accent); }
`
