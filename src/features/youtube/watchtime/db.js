import { openDatabase } from '../../../core/idb.js'

// lokale youtube datenbank, migrationen nur hinten anhaengen

export const YT_DB = 'ytx-youtube'

export const MIGRATIONS = [
  // v1 schauzeit pro video sitzung
  (db) => {
    const views = db.createObjectStore('views', { keyPath: 'id' })
    views.createIndex('startedAt', 'startedAt')
    views.createIndex('day', 'day')
    db.createObjectStore('meta', { keyPath: 'key' })
  }
]

let db = null

export function ytDb() {
  db ||= openDatabase(YT_DB, MIGRATIONS)
  return db
}
