import { createPageLoader } from '../../../core/pageData.js'
import { mainData } from '../../../registry/music/initialData.js'
import { parseArtistPage, parseCollectionPage, parseSearchPage, parseMoodsPage } from '../../../registry/music/parse.js'
import { musicDb } from './db.js'

// youtube music seiten im hintergrund wie ein normaler seitenaufruf
// ergebnisse landen geparst im cache, rohes html wird nie gespeichert

const HOUR = 3600 * 1000

const cache = {
  async get(key) {
    const r = await musicDb().get('cache', key)
    return r ? { value: r.value, ts: r.ts } : null
  },
  set(key, value) {
    return musicDb().put('cache', { key, value, ts: Date.now() })
  }
}

export const loader = createPageLoader({ extract: mainData, cache, minIntervalMs: 2000, maxAgeMs: 12 * HOUR })

export const catalog = {
  stats: loader.stats,

  artist(id, opts = {}) {
    return loader.load(`/channel/${encodeURIComponent(id)}`, { maxAge: 24 * HOUR, ...opts, transform: (m) => parseArtistPage(m.data, id) })
  },

  album(browseId, opts = {}) {
    return loader.load(`/browse/${encodeURIComponent(browseId)}`, { maxAge: 7 * 24 * HOUR, ...opts, transform: (m) => parseCollectionPage(m.data, { ...m.params, browseId }) })
  },

  playlist(id, opts = {}) {
    return loader.load(`/playlist?list=${encodeURIComponent(id)}`, { maxAge: 12 * HOUR, ...opts, transform: (m) => parseCollectionPage(m.data, { ...m.params, browseId: `VL${id}` }) })
  },

  search(query, opts = {}) {
    return loader.load(`/search?q=${encodeURIComponent(query)}`, { maxAge: 24 * HOUR, ...opts, transform: (m) => parseSearchPage(m.data) })
  },

  moods(opts = {}) {
    return loader.load('/moods_and_genres', { maxAge: 7 * 24 * HOUR, ...opts, transform: (m) => parseMoodsPage(m.data) })
  },

  async clearCache() {
    await musicDb().clear('cache')
  },

  async cacheInfo() {
    const db = musicDb()
    const count = await db.count('cache').catch(() => 0)
    const newest = await db.latest('cache', 'ts', 1).catch(() => [])
    return { count, newest: newest[0]?.ts || 0 }
  }
}

// cache aufraeumen, alte eintraege weg
export async function pruneCache(maxAgeMs = 14 * 24 * HOUR) {
  return musicDb().deleteWhere('cache', 'ts', IDBKeyRange.upperBound(Date.now() - maxAgeMs))
}
