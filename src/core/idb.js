import { log } from './log.js'

// versionierte indexeddb mit migrationsliste
// migration n hebt die datenbank von version n auf n+1

const req = (r) =>
  new Promise((ok, fail) => {
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  })

const done = (tx) =>
  new Promise((ok, fail) => {
    tx.oncomplete = () => ok()
    tx.onerror = () => fail(tx.error)
    tx.onabort = () => fail(tx.error || new Error('transaction abgebrochen'))
  })

export function openDatabase(name, migrations) {
  const status = { name, version: migrations.length, open: false, error: null, openedAt: 0, upgradedFrom: null, blocked: false }
  let dbp = null

  const open = () => {
    if (dbp) return dbp
    dbp = new Promise((ok, fail) => {
      if (typeof indexedDB === 'undefined') return fail(new Error('IndexedDB nicht verfügbar'))
      const r = indexedDB.open(name, migrations.length)
      r.onupgradeneeded = (e) => {
        const db = r.result
        const tx = r.transaction
        status.upgradedFrom = e.oldVersion
        for (let v = e.oldVersion; v < migrations.length; v++) {
          try {
            migrations[v](db, tx)
          } catch (err) {
            log.error(`idb migration ${name} v${v + 1}`, err)
            tx.abort()
            return
          }
        }
      }
      r.onblocked = () => {
        status.blocked = true
        log.warn(`idb ${name} blockiert durch anderen tab`)
      }
      r.onsuccess = () => {
        const db = r.result
        db.onversionchange = () => {
          db.close()
          dbp = null
          status.open = false
        }
        status.open = true
        status.openedAt = Date.now()
        ok(db)
      }
      r.onerror = () => {
        status.error = r.error?.message || 'unbekannt'
        dbp = null
        fail(r.error)
      }
    })
    return dbp
  }

  const withStore = async (store, mode, fn) => {
    const db = await open()
    const tx = db.transaction(store, mode)
    const result = fn(tx.objectStore(store), tx)
    const value = result instanceof IDBRequest ? await req(result) : await result
    await done(tx)
    return value
  }

  return {
    status,
    open,
    get: (store, key) => withStore(store, 'readonly', (s) => s.get(key)),
    put: (store, value) => withStore(store, 'readwrite', (s) => s.put(value)),
    delete: (store, key) => withStore(store, 'readwrite', (s) => s.delete(key)),
    clear: (store) => withStore(store, 'readwrite', (s) => s.clear()),
    count: (store) => withStore(store, 'readonly', (s) => s.count()),
    getAll: (store, query, count) => withStore(store, 'readonly', (s) => s.getAll(query, count)),
    putMany: (store, values) =>
      withStore(store, 'readwrite', (s) => {
        for (const v of values) s.put(v)
      }),
    deleteMany: (store, keys) =>
      withStore(store, 'readwrite', (s) => {
        for (const k of keys) s.delete(k)
      }),
    byIndex: (store, index, query, count) => withStore(store, 'readonly', (s) => s.index(index).getAll(query, count)),
    // neueste zuerst ueber einen index mit cursor
    latest: (store, index, limit = 50) =>
      withStore(store, 'readonly', (s) =>
        new Promise((ok, fail) => {
          const out = []
          const c = s.index(index).openCursor(null, 'prev')
          c.onsuccess = () => {
            const cur = c.result
            if (!cur || out.length >= limit) return ok(out)
            out.push(cur.value)
            cur.continue()
          }
          c.onerror = () => fail(c.error)
        })
      ),
    deleteWhere: (store, index, range) =>
      withStore(store, 'readwrite', (s) =>
        new Promise((ok, fail) => {
          let n = 0
          const c = s.index(index).openCursor(range)
          c.onsuccess = () => {
            const cur = c.result
            if (!cur) return ok(n)
            cur.delete()
            n++
            cur.continue()
          }
          c.onerror = () => fail(c.error)
        })
      ),
    async exportAll(stores) {
      const db = await open()
      const out = { database: name, version: db.version, exportedAt: new Date().toISOString(), stores: {} }
      for (const st of stores || [...db.objectStoreNames]) out.stores[st] = await withStore(st, 'readonly', (s) => s.getAll())
      return out
    },
    async importAll(dump, { replace = false, stores } = {}) {
      const db = await open()
      const names = stores || Object.keys(dump.stores || {}).filter((n) => db.objectStoreNames.contains(n))
      for (const st of names) {
        await withStore(st, 'readwrite', (s) => {
          if (replace) s.clear()
          for (const v of dump.stores[st] || []) s.put(v)
        })
      }
      return names
    },
    async sizes() {
      const db = await open()
      const out = {}
      for (const st of db.objectStoreNames) out[st] = await withStore(st, 'readonly', (s) => s.count())
      return out
    },
    close() {
      dbp?.then((db) => db.close()).catch(() => {})
      dbp = null
      status.open = false
    }
  }
}
