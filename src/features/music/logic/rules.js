import { artistKey } from './versions.js'

// lokale blocklisten fuer kuenstler songs und titelbegriffe

export const DEFAULT_TERMS = ['live', 'sped up', 'nightcore', 'remix', 'slowed', 'karaoke']

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function termRegex(term) {
  const t = String(term || '').trim()
  if (!t) return null
  // mehrere woerter duerfen durch leerzeichen oder bindestrich getrennt sein
  const body = t.split(/[\s-]+/).map(escapeRe).join('[\\s-]*')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${body}($|[^\\p{L}\\p{N}])`, 'iu')
}

export function compileRules(blocklist = {}) {
  const artists = blocklist.artists || []
  return {
    artistIds: new Set(artists.map((a) => a.id).filter(Boolean)),
    artistNames: new Set(artists.map((a) => String(a.name || '').trim().toLowerCase()).filter(Boolean)),
    songIds: new Set((blocklist.songs || []).map((s) => s.videoId).filter(Boolean)),
    terms: (blocklist.terms || []).map((t) => [t, termRegex(t)]).filter(([, re]) => re)
  }
}

export function blockReason(track, rules) {
  if (!track || !rules) return null
  if (track.videoId && rules.songIds.has(track.videoId)) return { kind: 'song', label: 'Song blockiert' }
  for (const a of track.artists || []) {
    if ((a.id && rules.artistIds.has(a.id)) || rules.artistNames.has(String(a.name || '').trim().toLowerCase())) return { kind: 'artist', label: `Künstler blockiert: ${a.name}` }
  }
  const title = `${track.title || ''} ${track.album?.name || ''}`
  for (const [term, re] of rules.terms) if (re.test(title)) return { kind: 'term', label: `Titelbegriff: ${term}` }
  return null
}

export function isExcluded(track, excluded = {}) {
  if (!track) return false
  if ((excluded.songs || []).some((s) => s.videoId === track.videoId)) return true
  const keys = new Set((excluded.artists || []).map(artistKey))
  return (track.artists || []).some((a) => keys.has(artistKey(a)))
}
