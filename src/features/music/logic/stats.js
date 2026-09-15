import { artistKey } from './versions.js'

// privates wrapped aus dem hoerverlauf

const pad = (n) => String(n).padStart(2, '0')

export function weekKey(ts) {
  const d = new Date(ts)
  const day = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day + 3)
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${pad(week)}`
}

export const monthKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function top(map, n) {
  return [...map.values()].sort((a, b) => b.listenedSec - a.listenedSec || b.plays - a.plays).slice(0, n)
}

export function computeStats(plays = [], { from = 0, to = Infinity, groupBy = 'week', limit = 10 } = {}) {
  const list = plays.filter((p) => p.startedAt >= from && p.startedAt <= to)
  const songs = new Map()
  const artists = new Map()
  const albums = new Map()
  const series = new Map()
  const byHour = Array.from({ length: 24 }, () => ({ plays: 0, listenedSec: 0 }))
  const byWeekday = Array.from({ length: 7 }, () => ({ plays: 0, listenedSec: 0 }))
  const totals = { plays: 0, listenedSec: 0, completes: 0, skips: 0, quickSkips: 0, liked: 0, songs: 0, artists: 0 }

  const add = (map, key, init, p) => {
    let v = map.get(key)
    if (!v) {
      v = { ...init, plays: 0, listenedSec: 0, skips: 0, completes: 0 }
      map.set(key, v)
    }
    v.plays++
    v.listenedSec += p.listenedSec || 0
    if (p.skipped) v.skips++
    if (p.completed) v.completes++
    return v
  }

  for (const p of list) {
    totals.plays++
    totals.listenedSec += p.listenedSec || 0
    if (p.completed) totals.completes++
    if (p.skipped) totals.skips++
    if (p.quickSkip) totals.quickSkips++
    if (p.liked) totals.liked++
    add(songs, p.videoId, { videoId: p.videoId, title: p.title, artists: p.artists || [] }, p)
    const a = p.artists?.[0]
    if (a) add(artists, artistKey(a), { key: artistKey(a), id: a.id || null, name: a.name }, p)
    if (p.album?.id) add(albums, p.album.id, { id: p.album.id, name: p.album.name, artists: p.artists || [] }, p)
    const k = groupBy === 'month' ? monthKey(p.startedAt) : weekKey(p.startedAt)
    add(series, k, { period: k }, p)
    const d = new Date(p.startedAt)
    byHour[d.getHours()].plays++
    byHour[d.getHours()].listenedSec += p.listenedSec || 0
    byWeekday[(d.getDay() + 6) % 7].plays++
    byWeekday[(d.getDay() + 6) % 7].listenedSec += p.listenedSec || 0
  }
  totals.songs = songs.size
  totals.artists = artists.size
  totals.skipRate = totals.plays ? totals.skips / totals.plays : 0
  const seriesList = [...series.values()].sort((a, b) => (a.period < b.period ? -1 : 1)).map((s) => ({ ...s, skipRate: s.plays ? s.skips / s.plays : 0 }))
  return {
    totals,
    topSongs: top(songs, limit),
    topArtists: top(artists, limit),
    topAlbums: top(albums, limit),
    series: seriesList,
    byHour,
    byWeekday,
    highSkip: [...songs.values()].filter((s) => s.skips >= 3 && s.skips / s.plays >= 0.6).sort((a, b) => b.skips - a.skips).slice(0, limit)
  }
}
