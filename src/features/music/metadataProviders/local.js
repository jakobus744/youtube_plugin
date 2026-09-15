import { catalog } from '../data/catalog.js'

// nutzt nur daten die youtube music selbst ausliefert
export const localProvider = {
  id: 'local',
  label: 'Lokal (YouTube-Music-Seiten + eigener Verlauf)',
  external: false,
  note: 'Ähnliche Künstler aus „Fans hören auch“ der Künstlerseite',
  available: () => true,
  async similarArtists(artist) {
    if (!artist?.id) return []
    const page = await catalog.artist(artist.id)
    return (page.similar || []).map((a) => ({ id: a.id, name: a.name }))
  },
  async genresOf() {
    // youtube music liefert keine genre angabe pro kuenstler
    return []
  }
}
