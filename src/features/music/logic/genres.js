// feste genre auswahl fuer den genre finder
// suchbegriffe so wie sie bei youtube music gute treffer liefern

export const GENRE_GROUPS = [
  ['Techno', ['Techno', 'Hard Techno', 'Melodic Techno', 'Minimal Techno', 'Peak Time Techno', 'Acid Techno', 'Industrial Techno', 'Schranz', 'Hypnotic Techno', 'Rave']],
  ['Hardstyle & Hard Dance', ['Hardstyle', 'Euphoric Hardstyle', 'Rawstyle', 'Hardcore', 'Frenchcore', 'Uptempo Hardcore', 'Hard Dance', 'Hardtekk', 'Happy Hardcore']],
  ['Hip-Hop & Rap', ['Deutschrap', 'Straßenrap', 'Trap', 'Deutsch Trap', 'Drill', 'UK Drill', 'Boom Bap', 'Cloud Rap', 'Phonk', 'Lo-Fi Hip-Hop', 'Old School Hip-Hop', 'Conscious Rap', 'Afro Trap', 'Melodic Rap', 'R&B']],
  ['Elektronisch', ['House', 'Tech House', 'Deep House', 'Afro House', 'Drum & Bass', 'Dubstep', 'Trance', 'Psytrance', 'EDM', 'Future Bass']],
  ['Weitere', ['Pop', 'Deutschpop', 'Indie', 'Rock', 'Metal', 'Punk', 'Reggaeton', 'Afrobeats', 'Schlager', 'Jazz', 'Klassik', 'Soundtrack']]
]

export const ALL_GENRES = GENRE_GROUPS.flatMap(([, list]) => list)

// vorschlaege zum hinzufuegen: erst genres aus den gruppen die du schon magst, dann je zwei aus jeder gruppe
export function suggestGenres(favorites = [], { extra = [], limit = 10 } = {}) {
  const have = new Set(favorites.map((g) => g.toLowerCase()))
  const near = GENRE_GROUPS.filter(([, list]) => list.some((g) => have.has(g.toLowerCase()))).flatMap(([, list]) => list)
  const spread = GENRE_GROUPS.flatMap(([, list]) => list.slice(0, 2))
  return [...new Set([...extra, ...near, ...spread])].filter((g) => g && !have.has(g.toLowerCase())).slice(0, limit)
}
