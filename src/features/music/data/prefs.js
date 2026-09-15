import { DEFAULT_TERMS } from '../logic/rules.js'
import { DEFAULT_WEIGHTS } from '../logic/taste.js'

// dauerhafte music vorlieben, profiluebergreifend im store bucket "music"
// geschmack gehoert zur person nicht zum ytx profil

export const PREFS_BUCKET = 'music'

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x)
const num = (v, def, min, max) => {
  const n = Number(v)
  return v === null || v === undefined || v === '' || !isFinite(n) ? def : Math.min(max, Math.max(min, n))
}
const strList = (x) => (Array.isArray(x) ? [...new Set(x.map((s) => String(s).trim()).filter(Boolean))] : null)
const artistList = (x) => (Array.isArray(x) ? x.filter((a) => isObj(a) && (a.id || a.name)).map((a) => ({ id: a.id || null, name: String(a.name || a.id) })) : [])
const songList = (x) => (Array.isArray(x) ? x.filter((s) => isObj(s) && s.videoId).map((s) => ({ videoId: s.videoId, title: String(s.title || ''), artists: artistList(s.artists) })) : [])

export const PROVIDER_IDS = ['local', 'musicbrainz', 'lastfm', 'ollama']

export function defaultPrefs() {
  return {
    discovery: 0.5,
    explain: true,
    history: { paused: false, retentionDays: null, minListenSec: 5, recordContext: true },
    blocklist: { artists: [], songs: [], terms: DEFAULT_TERMS.slice() },
    excluded: { artists: [], songs: [] },
    hideVersions: [],
    weights: { ...DEFAULT_WEIGHTS },
    halfLifeDays: 120,
    releases: { enabled: true, intervalHours: 24, maxArtists: 25, includeTopArtists: true, maxAgeDays: 60 },
    smartQueue: { autoSkip: false, skipBlocked: true, skipHighSkip: false, skipDuplicates: true, skipRecentlyPlayed: false, markOnly: false },
    providers: { local: { enabled: true }, musicbrainz: { enabled: false }, lastfm: { enabled: false, apiKey: '' }, ollama: { enabled: false, url: 'http://localhost:11434', model: '' } },
    genres: { favorites: [] }
  }
}

export function normalizePrefs(raw) {
  const d = defaultPrefs()
  if (!isObj(raw)) return d
  d.discovery = num(raw.discovery, d.discovery, 0, 1)
  d.explain = raw.explain !== false
  if (isObj(raw.history)) {
    d.history.paused = !!raw.history.paused
    d.history.retentionDays = raw.history.retentionDays == null || raw.history.retentionDays === '' ? null : num(raw.history.retentionDays, null, 1, 3650)
    d.history.minListenSec = num(raw.history.minListenSec, d.history.minListenSec, 0, 120)
    d.history.recordContext = raw.history.recordContext !== false
  }
  if (isObj(raw.blocklist)) {
    d.blocklist.artists = artistList(raw.blocklist.artists)
    d.blocklist.songs = songList(raw.blocklist.songs)
    d.blocklist.terms = strList(raw.blocklist.terms) ?? d.blocklist.terms
  }
  if (isObj(raw.excluded)) {
    d.excluded.artists = artistList(raw.excluded.artists)
    d.excluded.songs = songList(raw.excluded.songs)
  }
  d.hideVersions = strList(raw.hideVersions) || []
  if (isObj(raw.weights)) for (const k of Object.keys(d.weights)) d.weights[k] = num(raw.weights[k], d.weights[k], -10, 10)
  d.halfLifeDays = num(raw.halfLifeDays, d.halfLifeDays, 7, 3650)
  if (isObj(raw.releases)) {
    d.releases.enabled = raw.releases.enabled !== false
    d.releases.intervalHours = num(raw.releases.intervalHours, d.releases.intervalHours, 6, 24 * 14)
    d.releases.maxArtists = num(raw.releases.maxArtists, d.releases.maxArtists, 1, 100)
    d.releases.includeTopArtists = raw.releases.includeTopArtists !== false
    d.releases.maxAgeDays = num(raw.releases.maxAgeDays, d.releases.maxAgeDays, 7, 730)
  }
  if (isObj(raw.smartQueue)) for (const k of Object.keys(d.smartQueue)) if (k in raw.smartQueue) d.smartQueue[k] = !!raw.smartQueue[k]
  if (isObj(raw.providers)) {
    for (const id of PROVIDER_IDS) {
      const p = raw.providers[id]
      if (!isObj(p)) continue
      d.providers[id].enabled = id === 'local' ? p.enabled !== false : !!p.enabled
      for (const k of Object.keys(d.providers[id])) if (k !== 'enabled' && typeof p[k] === 'string') d.providers[id][k] = p[k]
    }
  }
  if (isObj(raw.genres)) d.genres.favorites = strList(raw.genres.favorites) || []
  return d
}

// session liegt nur im tab, ueberlebt kein schliessen
const SESSION_KEY = 'ytx.music.session'

export function readSession() {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

export function writeSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}
