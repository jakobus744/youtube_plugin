import { gmJson, hasGmRequest } from './http.js'

// aehnliche kuenstler und tags von last.fm, braucht eigenen api schluessel
export const lastfmProvider = {
  id: 'lastfm',
  label: 'Last.fm (ähnliche Künstler, Tags)',
  external: true,
  note: 'Braucht einen eigenen API-Key. Schickt Künstlernamen an last.fm',
  available: (prefs) => hasGmRequest() && !!prefs?.providers?.lastfm?.apiKey,
  async similarArtists(artist, prefs) {
    const key = prefs.providers.lastfm.apiKey
    const r = await gmJson(`https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist.name)}&limit=15&api_key=${encodeURIComponent(key)}&format=json`)
    return (r?.similarartists?.artist || []).map((a) => ({ id: null, name: a.name }))
  },
  async genresOf(artist, prefs) {
    const key = prefs.providers.lastfm.apiKey
    const r = await gmJson(`https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artist.name)}&api_key=${encodeURIComponent(key)}&format=json`)
    return (r?.toptags?.tag || []).slice(0, 5).map((t) => t.name)
  }
}
