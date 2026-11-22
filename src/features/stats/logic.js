// statistik ueber youtube und music, reine logik ohne dom
// beide quellen werden zu ereignissen gleicher form, dann ausgewertet, plan in docs/STATS.md

export const DAY = 24 * 3600 * 1000

const pad = (n) => String(n).padStart(2, '0')
export const dayKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ereignis: { id, src: 'yt' | 'music', start, sec, key, name, item, title, cats, kind, done, skipped, skipAt, liked, device }

export function fromViews(views, groupsOf = () => []) {
  const out = []
  for (const v of views || []) {
    if (!v || !(v.wallSec > 0)) continue
    const key = v.channel?.id || v.channel?.name || '?'
    const cats = [...(v.category ? [v.category] : []), ...groupsOf(v.channel || {})]
    out.push({
      id: `yt:${v.id}`,
      src: 'yt',
      start: v.startedAt,
      sec: v.wallSec,
      key,
      name: v.channel?.name || 'Unbekannt',
      item: v.videoId,
      title: v.title || v.videoId,
      cats,
      kind: v.kind || 'video',
      done: v.percent != null ? v.percent >= 0.9 : null,
      skipped: v.percent != null ? v.percent < 0.3 : null,
      skipAt: v.percent ?? null,
      liked: false,
      device: v.device || null
    })
  }
  return out
}

export function fromPlays(plays, genresOf = () => []) {
  const out = []
  for (const p of plays || []) {
    if (!p || !(p.listenedSec > 0)) continue
    const a = p.artists?.[0]
    const key = p.artistKeys?.[0] || a?.id || a?.name || '?'
    out.push({
      id: `music:${p.id}`,
      src: 'music',
      start: p.startedAt,
      sec: p.listenedSec,
      key,
      name: a?.name || 'Unbekannt',
      item: p.videoId,
      title: p.title || p.videoId,
      cats: genresOf(p) || [],
      kind: 'song',
      done: !!p.completed,
      skipped: !!p.skipped,
      skipAt: p.skipped ? p.skipAtPct ?? null : null,
      liked: !!p.liked,
      device: p.device || null
    })
  }
  return out
}

// gleiche ereignisse von mehreren geraeten nur einmal
export function dedupe(events) {
  const seen = new Map()
  for (const e of events) if (!seen.has(e.id)) seen.set(e.id, e)
  return [...seen.values()].sort((a, b) => a.start - b.start)
}

// zeitraeume: week, month, year, all, verschoben um offset (0 = aktuell, -1 = davor)
export function period(kind, now = Date.now(), offset = 0, first = null) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (kind === 'week') {
    const dow = (d.getDay() + 6) % 7
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + offset * 7)
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7)
    return { kind, from: +from, to: +to, label: `Woche ab ${from.getDate()}.${from.getMonth() + 1}.` }
  }
  if (kind === 'month') {
    const from = new Date(d.getFullYear(), d.getMonth() + offset, 1)
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1)
    return { kind, from: +from, to: +to, label: from.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) }
  }
  if (kind === 'year') {
    const from = new Date(d.getFullYear() + offset, 0, 1)
    return { kind, from: +from, to: +new Date(from.getFullYear() + 1, 0, 1), label: String(from.getFullYear()) }
  }
  const from = first ? +new Date(new Date(first).setHours(0, 0, 0, 0)) : +d - 365 * DAY
  return { kind: 'all', from, to: +d + DAY, label: 'Gesamt' }
}

export function previous(p) {
  if (p.kind === 'all') return null
  return period(p.kind, p.from, -1)
}

// balken: tage bis 45 tage, sonst wochen bis ~1 jahr, sonst monate
export function buckets(p) {
  const days = Math.round((p.to - p.from) / DAY)
  const out = []
  if (days <= 45) {
    for (let t = p.from; t < p.to; t += DAY) {
      const d = new Date(t)
      out.push({ from: t, to: t + DAY, label: `${d.getDate()}.${d.getMonth() + 1}.` })
    }
    // sommerzeit: auf mitternacht runden
    for (const b of out) {
      b.from = +new Date(new Date(b.from + 3600e3 * 3).setHours(0, 0, 0, 0))
      b.to = b.from + DAY
    }
    return { unit: 'day', list: out }
  }
  if (days <= 400) {
    let t = p.from
    while (t < p.to) {
      const d = new Date(t)
      const next = +new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
      out.push({ from: t, to: Math.min(next, p.to), label: `${d.getDate()}.${d.getMonth() + 1}.` })
      t = next
    }
    return { unit: 'week', list: out }
  }
  let d = new Date(new Date(p.from).getFullYear(), new Date(p.from).getMonth(), 1)
  while (+d < p.to) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    out.push({ from: +d, to: +next, label: `${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}` })
    d = next
  }
  return { unit: 'month', list: out }
}

const inRange = (e, p) => e.start >= p.from && e.start < p.to

function rank(list, keyOf, nameOf, limit) {
  const m = new Map()
  for (const e of list) {
    const k = keyOf(e)
    if (k == null) continue
    const v = m.get(k) || { key: k, name: nameOf(e), src: e.src, sec: 0, count: 0 }
    v.sec += e.sec
    v.count++
    m.set(k, v)
  }
  return [...m.values()].sort((a, b) => b.sec - a.sec).slice(0, limit)
}

function withTrend(cur, prevList) {
  const prev = new Map(prevList.map((x, i) => [x.key, { ...x, place: i + 1 }]))
  return cur.map((x, i) => {
    const p = prev.get(x.key)
    return { ...x, place: i + 1, prevSec: p?.sec || 0, prevPlace: p?.place || null, delta: p ? x.sec / Math.max(1, p.sec) - 1 : null }
  })
}

function shares(list, limit = 8) {
  const m = new Map()
  let total = 0
  for (const e of list) {
    if (!e.cats.length) continue
    // mehrere kategorien teilen sich die zeit
    const part = e.sec / e.cats.length
    for (const c of e.cats) m.set(c, (m.get(c) || 0) + part)
    total += e.sec
  }
  const all = [...m.entries()].sort((a, b) => b[1] - a[1])
  const top = all.slice(0, limit).map(([name, sec]) => ({ name, sec, share: total ? sec / total : 0 }))
  const rest = all.slice(limit).reduce((n, [, s]) => n + s, 0)
  if (rest) top.push({ name: 'Sonstige', sec: rest, share: rest / total, other: true })
  return { total, list: top, unknownSec: list.filter((e) => !e.cats.length).reduce((n, e) => n + e.sec, 0) }
}

function behavior(list) {
  const n = list.length
  const known = list.filter((e) => e.done != null)
  // youtube: wie weit geschaut bei allen videos, music: stelle beim ueberspringen
  const skips = list.filter((e) => e.skipAt != null && (e.src === 'yt' || e.skipped))
  const skipBins = Array(10).fill(0)
  for (const e of skips) skipBins[Math.min(9, Math.floor(e.skipAt * 10))]++
  return {
    count: n,
    done: known.length ? known.filter((e) => e.done).length / known.length : null,
    skipped: known.length ? known.filter((e) => e.skipped).length / known.length : null,
    skipBins,
    liked: n ? list.filter((e) => e.liked).length : 0,
    shorts: list.filter((e) => e.kind === 'short').reduce((s, e) => s + e.sec, 0)
  }
}

// sitzungen: ereignisse mit hoechstens 10 min luecke gehoeren zusammen
export function sessions(list, gapMs = 10 * 60 * 1000) {
  const out = []
  let cur = null
  for (const e of [...list].sort((a, b) => a.start - b.start)) {
    const end = e.start + e.sec * 1000
    if (cur && e.start - cur.end <= gapMs) {
      cur.end = Math.max(cur.end, end)
      cur.sec += e.sec
    } else {
      cur = { start: e.start, end, sec: e.sec }
      out.push(cur)
    }
  }
  return out
}

function records(all) {
  const byDay = new Map()
  for (const e of all) byDay.set(dayKey(e.start), (byDay.get(dayKey(e.start)) || 0) + e.sec)
  const days = [...byDay.keys()].sort()
  let best = 0
  let run = 0
  let prev = null
  for (const d of days) {
    const t = +new Date(`${d}T12:00:00`)
    run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  const topDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] || null
  const longest = sessions(all).sort((a, b) => b.sec - a.sec)[0] || null
  return { streak: best, topDay: topDay && { day: topDay[0], sec: topDay[1] }, longestSession: longest, totalSec: all.reduce((n, e) => n + e.sec, 0), count: all.length }
}

// neu entdeckt: erstes auftreten eines kuenstlers oder kanals in diesem zeitraum
function discovery(all, p) {
  const first = new Map()
  for (const e of all) {
    const k = `${e.src}:${e.key}`
    if (!first.has(k) || e.start < first.get(k).start) first.set(k, e)
  }
  const inP = all.filter((e) => inRange(e, p))
  const keys = new Set(inP.map((e) => `${e.src}:${e.key}`))
  const fresh = [...keys].filter((k) => inRange(first.get(k), p))
  const freshSet = new Set(fresh)
  const newSec = inP.filter((e) => freshSet.has(`${e.src}:${e.key}`)).reduce((n, e) => n + e.sec, 0)
  const total = inP.reduce((n, e) => n + e.sec, 0)
  return { total: keys.size, fresh: fresh.length, newShare: total ? newSec / total : 0, freshList: fresh.map((k) => first.get(k)).map((e) => ({ src: e.src, key: e.key, name: e.name, first: e.start })) }
}

// meilensteine: runde zahlen an wiedergaben je kuenstler oder kanal, im zeitraum erreicht
const MARKS = [10, 50, 100, 250, 500, 1000]
function milestones(all, p) {
  const count = new Map()
  const out = []
  for (const e of all) {
    if (e.start >= p.to) break
    const k = `${e.src}:${e.key}`
    const n = (count.get(k) || 0) + 1
    count.set(k, n)
    if (MARKS.includes(n) && inRange(e, p)) out.push({ src: e.src, key: e.key, name: e.name, n, at: e.start })
  }
  return out.sort((a, b) => b.n - a.n).slice(0, 8)
}

export function analyze(allEvents, p, { limit = 10 } = {}) {
  const all = dedupe(allEvents)
  const list = all.filter((e) => inRange(e, p))
  const prevP = previous(p)
  const prevList = prevP ? all.filter((e) => inRange(e, prevP)) : []
  const bySrc = (l, s) => l.filter((e) => e.src === s)
  const sum = (l) => l.reduce((n, e) => n + e.sec, 0)

  const b = buckets(p)
  const bars = b.list.map((x) => {
    const inB = list.filter((e) => e.start >= x.from && e.start < x.to)
    return { ...x, yt: sum(bySrc(inB, 'yt')), music: sum(bySrc(inB, 'music')) }
  })

  const heat = { yt: Array.from({ length: 7 }, () => Array(24).fill(0)), music: Array.from({ length: 7 }, () => Array(24).fill(0)) }
  for (const e of list) {
    const d = new Date(e.start)
    heat[e.src][(d.getDay() + 6) % 7][d.getHours()] += e.sec
  }

  const side = (s) => {
    const cur = bySrc(list, s)
    const prev = bySrc(prevList, s)
    return {
      sec: sum(cur),
      prevSec: prevP ? sum(prev) : null,
      top: withTrend(rank(cur, (e) => e.key, (e) => e.name, limit), rank(prev, (e) => e.key, (e) => e.name, 100)),
      items: rank(cur, (e) => e.item, (e) => `${e.title}\u0000${e.name}`, limit).map((x) => {
        const [title, by] = x.name.split('\u0000')
        return { ...x, name: title, by }
      }),
      cats: shares(cur),
      behavior: behavior(cur),
      sessions: sessions(cur)
    }
  }

  return {
    period: p,
    prevPeriod: prevP,
    total: sum(list),
    prevTotal: prevP ? sum(prevList) : null,
    unit: b.unit,
    bars,
    heat,
    yt: side('yt'),
    music: side('music'),
    discovery: discovery(all, p),
    milestones: milestones(all, p),
    records: records(all),
    devices: [...new Set(list.map((e) => e.device).filter(Boolean))]
  }
}

// detailansicht fuer einen kuenstler, kanal oder ein genre
export function detail(allEvents, { src, key, cat }, p) {
  const all = dedupe(allEvents).filter((e) => (src ? e.src === src : true) && (key != null ? e.key === key : true) && (cat ? e.cats.includes(cat) : true))
  const list = all.filter((e) => inRange(e, p))
  const b = buckets(p)
  const hours = Array(24).fill(0)
  for (const e of list) hours[new Date(e.start).getHours()] += e.sec
  return {
    name: all[0]?.name || cat || key,
    total: list.reduce((n, e) => n + e.sec, 0),
    count: list.length,
    first: all[0]?.start || null,
    allTime: all.reduce((n, e) => n + e.sec, 0),
    bars: b.list.map((x) => ({ ...x, sec: list.filter((e) => e.start >= x.from && e.start < x.to).reduce((n, e) => n + e.sec, 0) })),
    hours,
    items: rank(list, (e) => e.item, (e) => e.title, 10),
    behavior: behavior(list)
  }
}
