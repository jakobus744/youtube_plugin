// seitentypen von www.youtube.com aus der url
export function pageFromUrl(href) {
  let u
  try { u = new URL(href, 'https://www.youtube.com') } catch { return 'other' }
  const p = u.pathname
  if (p === '/' || p === '') return 'home'
  if (p.startsWith('/watch')) return 'watch'
  if (p.startsWith('/results')) return 'search'
  if (p.startsWith('/playlist')) return 'playlist'
  if (p.startsWith('/shorts/')) return 'shorts'
  if (p.startsWith('/feed/subscriptions')) return 'subscriptions'
  if (p.startsWith('/feed/history')) return 'history'
  if (p.startsWith('/feed/you') || p.startsWith('/feed/library')) return 'you'
  if (p.startsWith('/feed/')) return 'feed'
  if (/^\/(@|channel\/|c\/|user\/)/.test(p)) return 'channel'
  return 'other'
}

export function videoIdFromUrl(href) {
  try {
    const u = new URL(href, 'https://www.youtube.com')
    return u.pathname.startsWith('/watch') ? u.searchParams.get('v') : null
  } catch {
    return null
  }
}

export const PAGE_LABELS = {
  home: 'Startseite',
  watch: 'Videoseite',
  search: 'Suche',
  playlist: 'Playlist',
  subscriptions: 'Abos',
  channel: 'Kanal',
  shorts: 'Shorts',
  history: 'Verlauf',
  you: 'Mein YouTube',
  feed: 'Feed',
  other: 'Sonstige'
}

export const FILTER_PAGES = [
  ['home', 'Startseite'],
  ['subscriptions', 'Abos'],
  ['search', 'Suche'],
  ['watch', 'Empfehlungen auf Videoseite'],
  ['channel', 'Kanal'],
  ['playlist', 'Playlists']
]
