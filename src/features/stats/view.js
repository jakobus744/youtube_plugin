import { h } from '../../core/dom.js'
import { formatDate } from '../../core/format.js'
import { PANEL_CSS } from '../../panel/styles.js'
import { analyze, detail, period } from './logic.js'
import { localEvents, remoteEvents, cachedRemote, pushHistory } from './data.js'
import { stackedBars, heatmap, shareBar, rankList, skipBins, hourBars, mins, CHART_CSS } from './charts.js'
import { SRC_COLOR, SRC_LABEL, catColor, catLabel } from './colors.js'

// statistik ansicht fuer youtube und music, im panel kompakt und als eigene seite im vollbild, plan in docs/STATS.md

const KINDS = [['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr'], ['all', 'Gesamt']]
const SRCS = [['all', 'Alle'], ['yt', 'YouTube'], ['music', 'Music']]
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`)
const change = (cur, prev) => (prev ? `${cur >= prev ? '+' : '−'}${Math.round(Math.abs(cur / prev - 1) * 100)} %` : null)

const VIEW_CSS = `
.st { display: flex; flex-direction: column; gap: 4px; }
.st .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.st .nav { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.st .nav button { border: 1px solid var(--line); background: none; color: var(--fg); border-radius: 50%; width: 26px; height: 26px; cursor: pointer; }
.st .nav span { min-width: 90px; text-align: center; font-weight: 500; }
.st .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin: 6px 0; }
.st .kpi { background: var(--hover); border-radius: 10px; padding: 8px 10px; }
.st .kpi b { display: block; font-size: 15px; font-weight: 600; white-space: nowrap; }
.st .kpi small { color: var(--fg2); }
.st .kpi .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.st .cols { display: grid; gap: 4px 20px; }
.st.full .cols { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.st .sec h3 { display: flex; align-items: center; gap: 6px; }
.st .sec h3 i { width: 8px; height: 8px; border-radius: 50%; }
.st .note { color: var(--fg2); font-size: 11px; }
.st .pills { display: flex; flex-wrap: wrap; gap: 6px; }
.st .pill { background: var(--hover); border-radius: 12px; padding: 4px 10px; }
.st .back { align-self: flex-start; }
.st .heat2 { display: grid; gap: 8px; }
.st.full .heat2 { grid-template-columns: 1fr 1fr; }
.st .heat2 small { color: var(--fg2); }
`

let full = null

export function closeFull() {
  full?.remove()
  full = null
}

// grosse ansicht als eigene ebene ueber der seite
export function openFull() {
  closeFull()
  full = h('ytx-stats', { 'data-ytx-own': '' })
  const shadow = full.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = `${PANEL_CSS}\n${CHART_CSS}\n${VIEW_CSS}
.panel.fullv { inset: 0; top: 0; right: 0; bottom: 0; width: auto; max-width: none; max-height: none; border-radius: 0; resize: none; z-index: 2300; }
.fullv header { cursor: default; }
.fullv main { padding: 12px 16px 40px; max-width: 1100px; width: 100%; margin: 0 auto; }
.fullv .chart:not(.small) { max-width: 760px; margin: 0 auto; }`
  const close = h('button', { class: 'iconbtn', title: 'Schließen', text: '✕' })
  close.addEventListener('click', closeFull)
  const main = h('main')
  shadow.append(style, h('div', { class: 'panel fullv' }, h('header', null, h('span', { class: 'logo', text: 'ytx Statistik' }), h('span', { style: { flex: '1' } }), close), main))
  document.body.append(full)
  renderStats(main, { full: true })
}

export function renderStats(root, { full: isFull = false, onFull } = {}) {
  const ui = { kind: 'week', offset: 0, src: 'all', detail: null }
  const st = { events: [], remote: [], syncNote: '', syncing: false, devices: 0 }
  const box = h('div', { class: ['st', isFull && 'full'] })
  if (!isFull) {
    const style = h('style', { text: `${CHART_CSS}\n${VIEW_CSS}` })
    root.append(style)
  }
  root.append(box)
  const limit = isFull ? 10 : 5

  const chip = (label, on, fn) => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), text: label })
    b.addEventListener('click', fn)
    return b
  }

  function controls(p, { noSrc = false } = {}) {
    const prev = h('button', { type: 'button', title: 'Zeitraum davor', text: '‹' })
    const next = h('button', { type: 'button', title: 'Zeitraum danach', text: '›', disabled: ui.offset >= 0 })
    prev.addEventListener('click', () => ((ui.offset -= 1), draw()))
    next.addEventListener('click', () => ((ui.offset = Math.min(0, ui.offset + 1)), draw()))
    return h('div', { class: 'bar' },
      h('div', { class: 'chips' }, ...KINDS.map(([k, l]) => chip(l, ui.kind === k, () => ((ui.kind = k), (ui.offset = 0), draw())))),
      ui.kind === 'all' ? null : h('div', { class: 'nav' }, prev, h('span', { text: p.label }), next),
      noSrc ? null : h('div', { class: 'chips' }, ...SRCS.map(([k, l]) => chip(l, ui.src === k, () => ((ui.src = k), draw())))),
      onFull ? h('button', { type: 'button', class: 'chip', text: '⤢ Groß', onclick: onFull }) : null
    )
  }

  const events = () => {
    const all = [...st.events, ...st.remote]
    return ui.src === 'all' ? all : all.filter((e) => e.src === ui.src)
  }

  const openDetail = (d) => {
    ui.detail = d
    draw()
    box.scrollIntoView?.({ block: 'start' })
  }

  function kpi(label, value, sub, color) {
    return h('div', { class: 'kpi' }, h('b', { text: value }), h('small', null, color ? h('span', { class: 'dot', style: { background: color } }) : null, label, sub ? ` · ${sub}` : ''))
  }

  function sideSection(r, src) {
    const side = r[src]
    const color = SRC_COLOR[src]
    const isYt = src === 'yt'
    const sec = h('div', { class: 'sec' }, h('h3', null, h('i', { style: { background: color } }), SRC_LABEL[src]))
    if (!side.sec) {
      sec.append(h('p', { class: 'muted', text: 'Keine Daten in diesem Zeitraum.' }))
      return sec
    }
    sec.append(h('h3', { text: isYt ? 'YouTuber' : 'Künstler' }), rankList(side.top, { color, onPick: (x) => openDetail({ src, key: x.key }), sub: (x) => `${x.count} ${isYt ? 'Videos' : 'Songs'}` }))
    sec.append(h('h3', { text: isYt ? 'Videos' : 'Songs' }), rankList(side.items.slice(0, limit), { color, sub: (x) => `${x.by} · ${x.count}×` }))
    sec.append(h('h3', { text: isYt ? 'Kategorien & Gruppen' : 'Genres' }))
    if (side.cats.list.length) sec.append(shareBar(side.cats, { onPick: (cat) => openDetail({ src, cat }) }))
    if (side.cats.unknownSec) sec.append(h('p', { class: 'note', text: isYt ? `${mins(side.cats.unknownSec)} ohne Kategorie (ältere Einträge vor dem 22.11.2026)` : `${mins(side.cats.unknownSec)} noch ohne Genre. Genres ergänzt später der Mini-PC (MusicBrainz).` }))
    const b = side.behavior
    const ses = side.sessions
    const avg = ses.length ? ses.reduce((n, x) => n + x.sec, 0) / ses.length : 0
    sec.append(h('h3', { text: 'Verhalten' }), h('div', { class: 'kpis' },
      kpi(isYt ? 'zu Ende geschaut' : 'zu Ende gehört', pct(b.done)),
      kpi(isYt ? 'früh abgebrochen' : 'übersprungen', pct(b.skipped)),
      isYt ? kpi('Shorts', pct(side.sec ? b.shorts / side.sec : 0)) : kpi('Likes', String(b.liked)),
      kpi('Ø Sitzung', mins(avg), `${ses.length}×`)
    ))
    if (b.skipBins.some(Boolean)) sec.append(h('div', { class: 'note', text: isYt ? 'Wie weit du Videos schaust' : 'Wo du überspringst (Stelle im Song)' }), skipBins(b.skipBins, color))
    return sec
  }

  function overview(r) {
    const p = r.period
    const nodes = [controls(p)]
    if (!r.total) {
      nodes.push(h('p', { class: 'muted', text: 'In diesem Zeitraum keine Daten. Schauzeit (YouTube) und Hörverlauf (Music) müssen an sein.' }))
      return nodes
    }
    nodes.push(h('div', { class: 'kpis' },
      kpi('gesamt', mins(r.total), r.prevPeriod ? `${change(r.total, r.prevTotal) || 'neu'} zu davor` : null),
      ui.src !== 'music' ? kpi('YouTube', mins(r.yt.sec), change(r.yt.sec, r.yt.prevSec), SRC_COLOR.yt) : null,
      ui.src !== 'yt' ? kpi('Music', mins(r.music.sec), change(r.music.sec, r.music.prevSec), SRC_COLOR.music) : null,
      kpi('neu entdeckt', String(r.discovery.fresh), `${pct(r.discovery.newShare)} der Zeit`)
    ))
    const srcs = ui.src === 'all' ? ['yt', 'music'] : [ui.src]
    nodes.push(h('h3', { text: { day: 'Pro Tag', week: 'Pro Woche', month: 'Pro Monat' }[r.unit] }), stackedBars(r.bars, { srcs }))
    nodes.push(h('h3', { text: 'Wann' }), h('div', { class: 'heat2' }, ...srcs.map((k) => h('div', null, srcs.length > 1 ? h('small', { text: SRC_LABEL[k] }) : null, heatmap(r.heat[k], SRC_COLOR[k])))))
    nodes.push(h('div', { class: 'cols' }, ...srcs.map((k) => sideSection(r, k))))
    const extra = h('div', { class: 'sec' }, h('h3', { text: 'Rekorde & Meilensteine' }))
    const rec = r.records
    extra.append(h('div', { class: 'pills' },
      h('span', { class: 'pill', text: `längste Serie ${rec.streak} Tage` }),
      rec.topDay ? h('span', { class: 'pill', text: `stärkster Tag ${formatDate(rec.topDay.day)} · ${mins(rec.topDay.sec)}` }) : null,
      rec.longestSession ? h('span', { class: 'pill', text: `längste Sitzung ${mins(rec.longestSession.sec)}` }) : null,
      h('span', { class: 'pill', text: `seit Beginn ${mins(rec.totalSec)}` })
    ))
    if (r.milestones.length) extra.append(h('div', { class: 'pills', style: { marginTop: '6px' } }, ...r.milestones.map((m) => h('span', { class: 'pill', text: `${m.n}. Mal ${m.name}` }))))
    if (r.discovery.freshList.length) {
      extra.append(h('h3', { text: `Neu entdeckt · ${r.discovery.fresh}` }), h('div', { class: 'pills' }, ...r.discovery.freshList.slice(0, isFull ? 30 : 12).map((x) => {
        const b = h('button', { type: 'button', class: 'chip', text: x.name, style: { borderColor: SRC_COLOR[x.src] } })
        b.addEventListener('click', () => openDetail({ src: x.src, key: x.key }))
        return b
      })))
    }
    nodes.push(extra)
    return nodes
  }

  function detailView(d, p) {
    const r = detail([...st.events, ...st.remote], d, p)
    const color = d.cat ? catColor(d.cat) : SRC_COLOR[d.src]
    const back = h('button', { type: 'button', class: 'chip back', text: '‹ Übersicht' })
    back.addEventListener('click', () => ((ui.detail = null), draw()))
    const bars = r.bars.map((x) => ({ ...x, [d.src]: x.sec }))
    return [
      back,
      controls(p, { noSrc: true }),
      h('h3', { text: d.cat ? catLabel(d.cat) : r.name, style: { fontSize: '15px', textTransform: 'none', color: 'var(--fg)' } }),
      h('div', { class: 'kpis' },
        kpi('in diesem Zeitraum', mins(r.total), `${r.count}×`, color),
        kpi('seit Beginn', mins(r.allTime)),
        kpi('zuerst', r.first ? formatDate(new Date(r.first).toISOString()) : '–'),
        kpi(d.src === 'yt' ? 'zu Ende geschaut' : 'zu Ende gehört', pct(r.behavior.done))
      ),
      h('h3', { text: 'Verlauf' }), stackedBars(bars, { srcs: [d.src] }),
      h('h3', { text: 'Uhrzeit' }), hourBars(r.hours, color),
      h('h3', { text: d.src === 'yt' ? 'Videos' : 'Songs' }), r.items.length ? rankList(r.items, { color, sub: (x) => `${x.count}×` }) : h('p', { class: 'muted', text: 'Keine in diesem Zeitraum.' })
    ]
  }

  function syncLine() {
    const t = st.syncing ? 'gleicht mit der Nextcloud ab …' : st.syncNote
    return h('p', { class: 'note', text: t })
  }

  function draw() {
    const p = period(ui.kind, Date.now(), ui.offset, Math.min(Date.now(), ...[...st.events, ...st.remote].map((e) => e.start)))
    const body = ui.detail ? detailView(ui.detail, p) : overview(analyze(events(), p, { limit }))
    box.replaceChildren(...body, syncLine())
  }

  async function load() {
    box.replaceChildren(h('p', { class: 'muted', text: 'rechnet …' }))
    try {
      st.events = await localEvents(0)
      st.remote = await cachedRemote()
    } catch (e) {
      box.replaceChildren(h('p', { class: 'err', text: e.message }))
      return
    }
    draw()
    st.syncing = true
    draw()
    try {
      await pushHistory()
      const r = await remoteEvents()
      st.remote = r.events
      st.syncNote = r.note || `Daten von ${r.devices} Gerät${r.devices === 1 ? '' : 'en'} · ${r.files} Dateien aus der Nextcloud`
    } catch (e) {
      st.syncNote = `Abgleich nicht möglich: ${e.message}. Gezeigt wird der letzte Stand.`
    }
    st.syncing = false
    draw()
  }

  load()
  return { reload: load }
}
