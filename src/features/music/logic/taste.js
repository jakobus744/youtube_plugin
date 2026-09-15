import { artistKey } from './versions.js'
import { isExcluded } from './rules.js'

// lokales geschmacksprofil aus hoerverlauf, favoriten und feedback

export const DEFAULT_WEIGHTS = {
  complete: 1,
  repeat: 0.6,
  like: 2,
  partial: 0.4,
  skip: -1.6,
  favoriteArtist: 4,
  favoriteSong: 3,
  favoriteAlbum: 2,
  favoritePlaylist: 1,
  feedback: 1.5
}

export const DAY = 24 * 3600 * 1000

// ein frueher skip zaehlt stark negativ, ein skip kurz vor ende kaum
export function playScore(p, w = DEFAULT_WEIGHTS) {
  const pct = Math.max(0, Math.min(1, p.percent ?? 0))
  let s = 0
  if (p.completed) s = w.complete + (p.repeat ? w.repeat : 0)
  else if (p.skipped) s = w.skip * Math.pow(1 - pct, 1.5)
  else s = w.partial * pct
  if (p.liked) s += w.like
  return s
}

export const decay = (ageMs, halfLifeDays = 120) => Math.pow(0.5, Math.max(0, ageMs) / (halfLifeDays * DAY))

function bump(map, key, init) {
  let v = map.get(key)
  if (!v) {
    v = init()
    map.set(key, v)
  }
  return v
}

const emptyStats = () => ({ score: 0, plays: 0, completes: 0, skips: 0, quickSkips: 0, listenedSec: 0, lastPlayed: 0, firstPlayed: 0, liked: false })

export function buildProfile(plays = [], { favorites = [], feedback = [], excluded = {}, now = Date.now(), weights = DEFAULT_WEIGHTS, halfLifeDays = 120 } = {}) {
  const artists = new Map()
  const songs = new Map()
  const albums = new Map()
  let total = 0
  let listened = 0

  for (const p of plays) {
    if (isExcluded(p, excluded)) continue
    const d = decay(now - (p.startedAt || now), halfLifeDays)
    const sc = playScore(p, weights) * d
    total++
    listened += p.listenedSec || 0
    const touch = (st, name) => {
      st.score += sc
      st.plays++
      if (p.completed) st.completes++
      if (p.skipped) st.skips++
      if (p.quickSkip) st.quickSkips++
      if (p.liked) st.liked = true
      st.listenedSec += p.listenedSec || 0
      st.lastPlayed = Math.max(st.lastPlayed, p.startedAt || 0)
      st.firstPlayed = st.firstPlayed ? Math.min(st.firstPlayed, p.startedAt || now) : p.startedAt || now
      if (name && !st.name) st.name = name
    }
    const song = bump(songs, p.videoId, () => ({ ...emptyStats(), videoId: p.videoId, title: p.title, artists: p.artists || [], album: p.album || null }))
    touch(song, null)
    // gewicht auf mehrere kuenstler verteilen
    const list = (p.artists || []).slice(0, 4)
    list.forEach((a, i) => {
      const st = bump(artists, artistKey(a), () => ({ ...emptyStats(), key: artistKey(a), id: a.id || null, name: a.name }))
      const share = i === 0 ? 1 : 0.5
      const before = st.score
      touch(st, a.name)
      st.score = before + sc * share
    })
    if (p.album?.id) touch(bump(albums, p.album.id, () => ({ ...emptyStats(), id: p.album.id, name: p.album.name })), p.album.name)
  }

  for (const f of favorites) {
    if (f.type === 'artist') {
      const st = bump(artists, f.id ? f.id : `name:${(f.name || '').toLowerCase()}`, () => ({ ...emptyStats(), key: f.id, id: f.id, name: f.name }))
      st.score += weights.favoriteArtist * (f.weight ?? 1)
      st.favorite = true
    } else if (f.type === 'song') {
      const st = bump(songs, f.id, () => ({ ...emptyStats(), videoId: f.id, title: f.name, artists: f.artists || [] }))
      st.score += weights.favoriteSong * (f.weight ?? 1)
      st.favorite = true
      for (const a of f.artists || []) {
        const as = bump(artists, artistKey(a), () => ({ ...emptyStats(), key: artistKey(a), id: a.id, name: a.name }))
        as.score += weights.favoriteSong * 0.4
      }
    } else if (f.type === 'album') {
      const st = bump(albums, f.id, () => ({ ...emptyStats(), id: f.id, name: f.name }))
      st.score += weights.favoriteAlbum * (f.weight ?? 1)
      st.favorite = true
      for (const a of f.artists || []) {
        const as = bump(artists, artistKey(a), () => ({ ...emptyStats(), key: artistKey(a), id: a.id, name: a.name }))
        as.score += weights.favoriteAlbum * 0.5
      }
    }
  }

  const ignored = new Set()
  for (const fb of feedback) {
    if (fb.type === 'artist') {
      const st = bump(artists, fb.id, () => ({ ...emptyStats(), key: fb.id, id: fb.id?.startsWith('name:') ? null : fb.id, name: fb.name }))
      st.score += weights.feedback * (fb.value || 0)
      st.feedback = fb.value || 0
    } else if (fb.type === 'song') {
      if (fb.ignore) ignored.add(fb.id)
      const st = bump(songs, fb.id, () => ({ ...emptyStats(), videoId: fb.id, title: fb.name, artists: fb.artists || [] }))
      st.score += weights.feedback * (fb.value || 0)
    }
  }

  const maxArtist = Math.max(1, ...[...artists.values()].map((a) => Math.abs(a.score)))
  const maxSong = Math.max(1, ...[...songs.values()].map((s) => Math.abs(s.score)))

  return {
    artists,
    songs,
    albums,
    ignored,
    totals: { plays: total, listenedSec: listened },
    artistAffinity(a) {
      const st = artists.get(typeof a === 'string' ? a : artistKey(a))
      return st ? Math.max(-1, Math.min(1, st.score / maxArtist)) : 0
    },
    songAffinity(videoId) {
      const st = songs.get(videoId)
      return st ? Math.max(-1, Math.min(1, st.score / maxSong)) : 0
    },
    artistPlays(a) {
      return artists.get(typeof a === 'string' ? a : artistKey(a))?.plays || 0
    },
    songPlays(videoId) {
      return songs.get(videoId)?.plays || 0
    },
    isHighSkip(videoId, { minSkips = 3, rate = 0.6 } = {}) {
      const st = songs.get(videoId)
      return !!st && st.skips >= minSkips && st.skips / Math.max(1, st.plays) >= rate
    },
    topArtists(n = 20, { minScore = 0.01 } = {}) {
      return [...artists.values()].filter((a) => a.score > minScore).sort((a, b) => b.score - a.score).slice(0, n)
    },
    topSongs(n = 20) {
      return [...songs.values()].filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, n)
    }
  }
}
