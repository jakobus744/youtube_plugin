// seitentypen von music.youtube.com aus der url
// browse ids statt sprachabhaengiger titel

export const PAGE_LABELS = {
  home: 'Startseite',
  explore: 'Entdecken',
  library: 'Mediathek',
  watch: 'Player',
  search: 'Suche',
  artist: 'Künstler',
  album: 'Album',
  playlist: 'Playlist',
  moods: 'Stimmungen & Genres',
  genre: 'Genre',
  charts: 'Charts',
  newReleases: 'Neuerscheinungen',
  history: 'Verlauf',
  podcast: 'Podcast',
  other: 'Sonstige'
}

const BROWSE_PAGES = [
  [/^FEmusic_home$/, 'home'],
  [/^FEmusic_explore$/, 'explore'],
  [/^FEmusic_(library|liked)/, 'library'],
  [/^FEmusic_history$/, 'history'],
  [/^FEmusic_moods_and_genres_category$/, 'genre'],
  [/^FEmusic_moods_and_genres$/, 'moods'],
  [/^FEmusic_charts$/, 'charts'],
  [/^FEmusic_new_releases/, 'newReleases'],
  [/^MPREb_/, 'album'],
  [/^(VL|RD|OLAK|PL)/, 'playlist'],
  [/^MPSP/, 'podcast'],
  [/^UC[\w-]{22}$/, 'artist']
]

export function browseIdFromUrl(href) {
  try {
    const u = new URL(href, 'https://music.youtube.com')
    const m = u.pathname.match(/^\/(?:browse|channel)\/([^/?#]+)/)
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

export function pageFromUrl(href) {
  let u
  try {
    u = new URL(href, 'https://music.youtube.com')
  } catch {
    return 'other'
  }
  const p = u.pathname
  if (p === '/' || p === '') return 'home'
  if (p === '/watch') return 'watch'
  if (p === '/search') return 'search'
  if (p === '/explore') return 'explore'
  if (p === '/playlist') return 'playlist'
  if (p === '/podcasts') return 'podcast'
  if (p === '/library' || p.startsWith('/library/')) return 'library'
  if (p === '/moods_and_genres') return 'moods'
  if (p === '/charts') return 'charts'
  if (p === '/new_releases') return 'newReleases'
  if (p === '/history') return 'history'
  // kuenstler haben inzwischen handle urls wie /@zah1de
  if (/^\/@[^/]+\/?$/.test(p)) return 'artist'
  const id = browseIdFromUrl(href)
  if (id) for (const [re, page] of BROWSE_PAGES) if (re.test(id)) return page
  return 'other'
}

export function videoIdFromUrl(href) {
  try {
    const u = new URL(href, 'https://music.youtube.com')
    return u.pathname === '/watch' ? u.searchParams.get('v') : null
  } catch {
    return null
  }
}
