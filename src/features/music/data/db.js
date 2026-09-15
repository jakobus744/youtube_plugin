import { openDatabase } from '../../../core/idb.js'

// lokale music datenbank
// neue schemaaenderungen nur hinten anhaengen, nie bestehende migrationen aendern

export const MUSIC_DB = 'ytx-music'

export const MIGRATIONS = [
  // v1 grundschema
  (db) => {
    const plays = db.createObjectStore('plays', { keyPath: 'id' })
    plays.createIndex('startedAt', 'startedAt')
    plays.createIndex('videoId', 'videoId')
    plays.createIndex('artistKeys', 'artistKeys', { multiEntry: true })

    const tracks = db.createObjectStore('tracks', { keyPath: 'videoId' })
    tracks.createIndex('seenAt', 'seenAt')

    const artists = db.createObjectStore('artists', { keyPath: 'id' })
    artists.createIndex('checkedAt', 'checkedAt')

    const favorites = db.createObjectStore('favorites', { keyPath: 'key' })
    favorites.createIndex('type', 'type')

    const releases = db.createObjectStore('releases', { keyPath: 'id' })
    releases.createIndex('artistId', 'artistId')
    releases.createIndex('firstSeen', 'firstSeen')

    db.createObjectStore('feedback', { keyPath: 'key' })

    const cache = db.createObjectStore('cache', { keyPath: 'key' })
    cache.createIndex('ts', 'ts')

    db.createObjectStore('meta', { keyPath: 'key' })
  },
  // v2 genre zuordnungen aus genre seiten und suche
  (db) => {
    const genres = db.createObjectStore('genres', { keyPath: 'key' })
    genres.createIndex('checkedAt', 'checkedAt')
  }
]

export const USER_STORES = ['plays', 'favorites', 'feedback', 'releases', 'meta', 'genres']
export const CACHE_STORES = ['tracks', 'artists', 'cache']

let db = null

export function musicDb() {
  db ||= openDatabase(MUSIC_DB, MIGRATIONS)
  return db
}

export async function getMeta(key, def = null) {
  const r = await musicDb().get('meta', key)
  return r ? r.value : def
}

export function setMeta(key, value) {
  return musicDb().put('meta', { key, value, ts: Date.now() })
}
