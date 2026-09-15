import { artistKey, trackKey, versionTags } from './versions.js'
import { blockReason, isExcluded } from './rules.js'
import { DAY } from './taste.js'

// eigene empfehlungen mit erklaerung
// discovery 0 bevorzugt bekanntes, 1 bevorzugt passendes aber neues

export const SOURCE_WEIGHTS = {
  seed: 1.1,
  favoriteArtist: 1,
  release: 0.9,
  topArtist: 0.8,
  similar: 0.65,
  history: 0.6,
  genre: 0.5,
  featured: 0.4,
  search: 0.35
}

export function discoveryValue(mode) {
  if (typeof mode === 'number') return Math.max(0, Math.min(1, mode))
  return { familiar: 0.1, balanced: 0.5, explore: 0.9 }[mode] ?? 0.5
}

function reasonText(src, ctx) {
  switch (src.kind) {
    case 'seed':
      return src.via ? `Passend zu ${src.via}` : 'Passend zum Startpunkt'
    case 'favoriteArtist':
      return 'Favorisierter Künstler'
    case 'release':
      return 'Neu von einem Favoriten'
    case 'topArtist':
      return 'Oft von dir gehört'
    case 'similar':
      return `Ähnlich zu ${src.via}`
    case 'genre':
      return `Genre: ${src.genre}`
    case 'featured':
      return src.via ? `Von Fans von ${src.via} gehört` : 'Von Fans deiner Favoriten häufig gehört'
    case 'history':
      return 'Lange nicht gehört'
    case 'search':
      return src.via ? `Suche: ${src.via}` : 'Suchtreffer'
    default:
      return null
  }
}

// kandidaten gleicher songs zusammenfuehren, quellen sammeln
export function mergeCandidates(list) {
  const byId = new Map()
  for (const c of list) {
    if (!c?.videoId) continue
    const prev = byId.get(c.videoId)
    if (prev) {
      prev.sources.push(...(c.sources || []))
      if (!prev.album && c.album) prev.album = c.album
      if (!prev.durationSec && c.durationSec) prev.durationSec = c.durationSec
      if ((!prev.artists?.length || prev.artists.every((a) => !a.id)) && c.artists?.some((a) => a.id)) prev.artists = c.artists
    } else {
      byId.set(c.videoId, { ...c, sources: [...(c.sources || [])] })
    }
  }
  return [...byId.values()]
}

export function scoreCandidate(c, profile, opts) {
  const d = opts.discovery
  const now = opts.now
  let rel = 0
  let fit = 0
  const reasons = []
  const seen = new Set()
  for (const s of c.sources) {
    const w = (SOURCE_WEIGHTS[s.kind] ?? 0.3) * (s.weight ?? 1)
    rel = Math.max(rel, w) + Math.min(w, rel) * 0.25
    // ueber einen favoriten gefunden, dessen affinitaet zaehlt als passung
    if (s.viaKey) fit = Math.max(fit, profile.artistAffinity(s.viaKey) * (s.kind === 'similar' ? 0.6 : 0.4))
    const txt = reasonText(s)
    if (txt && !seen.has(txt)) {
      seen.add(txt)
      reasons.push(txt)
    }
  }
  const keys = (c.artists || []).map(artistKey)
  const aff = keys.length ? Math.max(...keys.map((k) => profile.artistAffinity(k))) : 0
  const artistPlays = keys.length ? Math.max(...keys.map((k) => profile.artistPlays(k))) : 0
  const songPlays = profile.songPlays(c.videoId)
  const knownArtist = Math.min(1, artistPlays / 8)
  const knownSong = Math.min(1, songPlays / 3)
  const fam = 0.6 * knownArtist + 0.4 * knownSong
  const mix = (1 - d) * (0.3 + 0.7 * fam) + d * (0.3 + 0.7 * (1 - fam))
  // bekanntes zaehlt beim entdecken weniger, passung zu favoriten bleibt
  let score = (rel + fit + 0.8 * Math.max(0, aff) * (1 - 0.7 * d) + 0.3 * Math.max(0, profile.songAffinity(c.videoId)) * (1 - d)) * mix
  if (aff < 0) score += aff * 1.2
  if (profile.isHighSkip(c.videoId)) {
    score -= 1
    reasons.push('Oft übersprungen')
  }
  const last = profile.songs.get(c.videoId)?.lastPlayed || 0
  if (last && now - last < (opts.recentHours ?? 3) * 3600 * 1000 && !c.sources.some((s) => s.kind === 'history')) score -= 0.6
  const favoriteArtist = keys.some((k) => profile.artists.get(k)?.favorite)
  if (!songPlays && !artistPlays && !favoriteArtist) reasons.push('Noch nie gehört')
  if (last && now - last > (opts.longAgoDays ?? 45) * DAY && profile.songs.get(c.videoId)?.score > 0 && !reasons.includes('Lange nicht gehört')) reasons.push('Lange nicht gehört')
  return { score, reasons, familiarity: fam, affinity: aff }
}

export function rank(candidates, profile, options = {}) {
  const opts = {
    discovery: discoveryValue(options.discovery ?? 0.5),
    now: options.now ?? Date.now(),
    rules: options.rules || null,
    excluded: options.excluded || {},
    hideVersions: options.hideVersions || [],
    onlyKnownArtists: !!options.onlyKnownArtists,
    maxPerArtist: options.maxPerArtist ?? null,
    limit: options.limit ?? 50,
    recentHours: options.recentHours,
    longAgoDays: options.longAgoDays,
    excludeIds: options.excludeIds || new Set()
  }
  const scored = []
  for (const c of mergeCandidates(candidates)) {
    if (opts.excludeIds.has(c.videoId)) continue
    if (profile.ignored?.has(c.videoId)) continue
    if (opts.rules && blockReason(c, opts.rules)) continue
    if (isExcluded(c, opts.excluded)) continue
    if (opts.hideVersions.length && versionTags(c.title).some((t) => opts.hideVersions.includes(t))) continue
    if (opts.onlyKnownArtists) {
      const known = (c.artists || []).some((a) => profile.artistPlays(artistKey(a)) >= 2 || profile.artists.get(artistKey(a))?.favorite)
      if (!known) continue
    }
    scored.push({ ...c, ...scoreCandidate(c, profile, opts) })
  }
  scored.sort((a, b) => b.score - a.score)

  // gleiche songs in anderer fassung nur einmal
  const keys = new Set()
  const perArtist = new Map()
  const cap = opts.maxPerArtist ?? (opts.discovery > 0.7 ? 2 : opts.discovery < 0.3 ? 4 : 3)
  const out = []
  for (const c of scored) {
    const k = trackKey(c)
    if (keys.has(k)) continue
    const a = artistKey(c.artists?.[0])
    const n = perArtist.get(a) || 0
    if (a && n >= cap) continue
    keys.add(k)
    perArtist.set(a, n + 1)
    out.push(c)
    if (out.length >= opts.limit) break
  }
  return out
}
