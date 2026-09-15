import { artistKey, trackKey } from './versions.js'
import { blockReason } from './rules.js'

// entscheidet ob ein song in youtubes warteschlange uebersprungen wird
// die warteschlange selbst wird nie umgebaut

export function skipDecision(track, ctx) {
  if (!track?.videoId) return null
  const { rules, profile, settings = {}, recentKeys, recentIds, now = Date.now() } = ctx
  const blocked = rules && blockReason(track, rules)
  if (blocked) return blocked
  if (settings.onlyKnownArtists && profile) {
    const known = (track.artists || []).some((a) => profile.artistPlays(artistKey(a)) >= 2 || profile.artists.get(artistKey(a))?.favorite)
    if (!known) return { kind: 'unknown', label: 'Unbekannter Künstler (Session „Nur bekannte Musik“)' }
  }
  if (settings.skipHighSkip && profile?.isHighSkip(track.videoId)) return { kind: 'highSkip', label: 'Oft übersprungen' }
  if (settings.skipDuplicates !== false && recentKeys) {
    const k = trackKey(track)
    const seen = recentKeys.get(k)
    if (seen && seen.videoId !== track.videoId && now - seen.ts < 3 * 3600 * 1000) return { kind: 'duplicate', label: 'Andere Fassung schon gespielt' }
  }
  if (settings.skipRecentlyPlayed && recentIds) {
    const ts = recentIds.get(track.videoId)
    if (ts && now - ts < 2 * 3600 * 1000) return { kind: 'recent', label: 'Kürzlich gespielt' }
  }
  return null
}

export function queueTotals(items, selectedIndex, positionSec = 0) {
  let total = 0
  let remaining = 0
  let unknown = 0
  items.forEach((it, i) => {
    if (!it.durationSec) {
      unknown++
      return
    }
    total += it.durationSec
    if (i > selectedIndex) remaining += it.durationSec
    else if (i === selectedIndex) remaining += Math.max(0, it.durationSec - positionSec)
  })
  return { total, remaining, unknown, count: items.length, after: Math.max(0, items.length - selectedIndex - 1) }
}
