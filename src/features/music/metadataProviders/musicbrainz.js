import { gmJson, hasGmRequest } from './http.js'

// genre tags von musicbrainz, freiwillig und standardmaessig aus
export const musicbrainzProvider = {
  id: 'musicbrainz',
  label: 'MusicBrainz (Genres)',
  external: true,
  note: 'Schickt Künstlernamen an musicbrainz.org. Braucht Tampermonkey-Freigabe für die Domain',
  available: () => hasGmRequest(),
  async genresOf(artist) {
    if (!artist?.name) return []
    const q = encodeURIComponent(`artist:"${artist.name}"`)
    const r = await gmJson(`https://musicbrainz.org/ws/2/artist/?query=${q}&limit=1&fmt=json`, { headers: { accept: 'application/json' } })
    const a = r?.artists?.[0]
    if (!a || (a.score ?? 0) < 90) return []
    return (a.tags || []).sort((x, y) => (y.count || 0) - (x.count || 0)).slice(0, 5).map((t) => t.name)
  }
}
