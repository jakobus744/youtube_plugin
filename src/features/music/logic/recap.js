import { artistKey } from './versions.js'
import { DAY } from './taste.js'

// wochenrueckblick, woche beginnt montags 0 uhr lokale zeit

export function weekStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

export const lastWeekStart = (now) => weekStart(weekStart(now) - DAY)

export function weekLabel(start) {
  const end = new Date(start + 6 * DAY)
  const a = new Date(start)
  const fmt = (d, withMonth) => `${d.getDate()}.${withMonth ? `${d.getMonth() + 1}.` : ''}`
  return `${fmt(a, a.getMonth() !== end.getMonth())}–${fmt(end, true)}${end.getFullYear()}`
}

// plays: alle wiedergaben, damit erkannt wird wer wirklich neu ist
export function weeklyRecap(plays, start, { limit = 5 } = {}) {
  const end = start + 7 * DAY
  const firstSeen = new Map()
  for (const p of plays) {
    for (const a of p.artists || []) {
      const k = artistKey(a)
      if (!k) continue
      const prev = firstSeen.get(k)
      if (prev == null || p.startedAt < prev) firstSeen.set(k, p.startedAt)
    }
  }
  const week = plays.filter((p) => p.startedAt >= start && p.startedAt < end)
  if (!week.length) return null
  const artists = new Map()
  const songs = new Map()
  let listenedSec = 0
  let skips = 0
  for (const p of week) {
    listenedSec += p.listenedSec || 0
    if (p.skipped) skips++
    const s = songs.get(p.videoId) || { videoId: p.videoId, title: p.title, artists: p.artists || [], plays: 0, listenedSec: 0 }
    s.plays++
    s.listenedSec += p.listenedSec || 0
    songs.set(p.videoId, s)
    const seen = new Set()
    for (const a of p.artists || []) {
      const k = artistKey(a)
      if (!k || seen.has(k)) continue
      seen.add(k)
      const v = artists.get(k) || { key: k, id: a.id || null, name: a.name, plays: 0, listenedSec: 0, isNew: firstSeen.get(k) >= start }
      v.plays++
      v.listenedSec += p.listenedSec || 0
      artists.set(k, v)
    }
  }
  const byTime = (a, b) => b.listenedSec - a.listenedSec || b.plays - a.plays
  const all = [...artists.values()].sort(byTime)
  return {
    start,
    end,
    label: weekLabel(start),
    plays: week.length,
    listenedSec,
    skipRate: week.length ? skips / week.length : 0,
    songCount: songs.size,
    artistCount: artists.size,
    topArtists: all.slice(0, limit),
    topSongs: [...songs.values()].sort(byTime).slice(0, limit),
    newArtists: all.filter((a) => a.isNew).slice(0, 8),
    newArtistCount: all.filter((a) => a.isNew).length
  }
}

export function recapText(r, fmt) {
  const names = (list) => list.map((a) => a.name).join(', ')
  return [
    `Meine Musikwoche ${r.label}`,
    `${fmt(r.listenedSec)} gehört · ${r.plays} Wiedergaben · ${r.songCount} Songs · ${r.artistCount} Künstler`,
    '',
    'Top-Künstler',
    ...r.topArtists.map((a, i) => `${i + 1}. ${a.name} (${fmt(a.listenedSec)})`),
    '',
    'Top-Songs',
    ...r.topSongs.map((s, i) => `${i + 1}. ${s.title} – ${names(s.artists)} (${s.plays}×)`),
    ...(r.newArtists.length ? ['', `Neu entdeckt (${r.newArtistCount})`, names(r.newArtists)] : [])
  ].join('\n')
}
