import { store } from '../../core/store.js'
import { log } from '../../core/log.js'
import { debounce } from '../../core/scheduler.js'
import { musicDb, getMeta, setMeta, USER_STORES, MUSIC_DB } from './data/db.js'
import { PREFS_BUCKET, normalizePrefs, readSession, writeSession } from './data/prefs.js'
import { buildProfile, DAY } from './logic/taste.js'
import { compileRules } from './logic/rules.js'
import { effectiveSettings } from './logic/sessions.js'
import { artistKey } from './logic/versions.js'

// gemeinsamer zustand aller music features
// verlauf favoriten feedback und neuerscheinungen liegen in indexeddb, vorlieben im store

const handlers = new Map()

function emit(type, payload) {
  for (const fn of handlers.get(type) || []) {
    try { fn(payload) } catch (e) { log.error(`music event ${type}`, e) }
  }
}

let profileCache = null
let profilePromise = null
const invalidate = () => {
  profileCache = null
  profilePromise = null
}

export const music = {
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set())
    handlers.get(type).add(fn)
    return () => handlers.get(type)?.delete(fn)
  },
  emit,

  // ---------- vorlieben ----------

  prefs() {
    return store.bucket(PREFS_BUCKET, normalizePrefs)
  },

  updatePrefs(mutator) {
    const next = store.updateBucket(PREFS_BUCKET, mutator, normalizePrefs)
    invalidate()
    emit('prefs', next)
    return next
  },

  session() {
    return readSession()
  },

  setSession(presetId) {
    writeSession(presetId ? { presetId, startedAt: Date.now() } : null)
    emit('session', readSession())
  },

  effective() {
    return effectiveSettings(this.prefs(), readSession())
  },

  rules() {
    return compileRules(this.effective().blocklist)
  },

  // ---------- verlauf ----------

  history: {
    async add(rec) {
      const p = music.prefs()
      if (p.history.paused) return false
      if ((rec.listenedSec || 0) < p.history.minListenSec && !rec.completed) return false
      if (!p.history.recordContext) delete rec.context
      await musicDb().put('plays', rec)
      await musicDb()
        .put('tracks', { videoId: rec.videoId, title: rec.title, artists: rec.artists, album: rec.album, year: rec.year, durationSec: rec.durationSec, seenAt: rec.endedAt })
        .catch(() => {})
      await setMeta('lastPlayAt', rec.endedAt)
      invalidate()
      emit('plays', rec)
      return true
    },
    list({ from = 0, to = Date.now() + DAY } = {}) {
      return musicDb().byIndex('plays', 'startedAt', IDBKeyRange.bound(from, to))
    },
    recent(limit = 50) {
      return musicDb().latest('plays', 'startedAt', limit)
    },
    count() {
      return musicDb().count('plays')
    },
    async remove(id) {
      await musicDb().delete('plays', id)
      invalidate()
      emit('plays', null)
    },
    async removeMany(ids) {
      await musicDb().deleteMany('plays', ids)
      invalidate()
      emit('plays', null)
    },
    async clear() {
      await musicDb().clear('plays')
      await musicDb().clear('tracks')
      invalidate()
      emit('plays', null)
    },
    async applyRetention() {
      const days = music.prefs().history.retentionDays
      if (!days) return 0
      const n = await musicDb().deleteWhere('plays', 'startedAt', IDBKeyRange.upperBound(Date.now() - days * DAY))
      if (n) {
        invalidate()
        emit('plays', null)
      }
      return n
    }
  },

  // ---------- favoriten ----------

  favorites: {
    all() {
      return musicDb().getAll('favorites')
    },
    byType(type) {
      return musicDb().byIndex('favorites', 'type', type)
    },
    async has(type, id) {
      return !!(await musicDb().get('favorites', `${type}:${id}`))
    },
    async toggle(item) {
      const key = `${item.type}:${item.id}`
      const db = musicDb()
      const prev = await db.get('favorites', key)
      if (prev) await db.delete('favorites', key)
      else await db.put('favorites', { key, type: item.type, id: item.id, name: item.name || item.title || '', artists: item.artists || [], thumbnail: item.thumbnail || '', weight: item.weight ?? 1, addedAt: Date.now() })
      invalidate()
      emit('favorites', { key, on: !prev })
      return !prev
    },
    async setWeight(key, weight) {
      const db = musicDb()
      const prev = await db.get('favorites', key)
      if (!prev) return
      await db.put('favorites', { ...prev, weight })
      invalidate()
      emit('favorites', { key, on: true })
    },
    async remove(key) {
      await musicDb().delete('favorites', key)
      invalidate()
      emit('favorites', { key, on: false })
    }
  },

  // ---------- feedback ----------

  feedback: {
    all() {
      return musicDb().getAll('feedback')
    },
    async adjust({ type, id, name, artists, delta = 0, ignore }) {
      const key = `${type}:${id}`
      const db = musicDb()
      const prev = (await db.get('feedback', key)) || { key, type, id, name, artists: artists || [], value: 0 }
      const next = { ...prev, name: name || prev.name, value: Math.max(-3, Math.min(3, (prev.value || 0) + delta)), ts: Date.now() }
      if (ignore !== undefined) next.ignore = !!ignore
      await db.put('feedback', next)
      invalidate()
      emit('feedback', next)
      return next
    },
    async remove(key) {
      await musicDb().delete('feedback', key)
      invalidate()
      emit('feedback', null)
    }
  },

  // aktionen aus empfehlungen und player
  async act(kind, track) {
    const first = track?.artists?.[0]
    const aKey = first ? artistKey(first) : null
    switch (kind) {
      case 'more':
        await music.feedback.adjust({ type: 'song', id: track.videoId, name: track.title, artists: track.artists, delta: 1 })
        if (aKey) await music.feedback.adjust({ type: 'artist', id: aKey, name: first.name, delta: 0.5 })
        return 'Mehr davon gemerkt'
      case 'less':
        await music.feedback.adjust({ type: 'song', id: track.videoId, name: track.title, artists: track.artists, delta: -1 })
        if (aKey) await music.feedback.adjust({ type: 'artist', id: aKey, name: first.name, delta: -0.5 })
        return 'Weniger davon gemerkt'
      case 'preferArtist':
        if (!aKey) return 'Kein Künstler erkannt'
        await music.feedback.adjust({ type: 'artist', id: aKey, name: first.name, delta: 2 })
        return `${first.name} wird bevorzugt`
      case 'blockArtist':
        if (!first) return 'Kein Künstler erkannt'
        music.updatePrefs((p) => {
          if (!p.blocklist.artists.some((a) => artistKey(a) === aKey)) p.blocklist.artists.push({ id: first.id || null, name: first.name })
        })
        return `${first.name} blockiert`
      case 'ignoreSong':
        await music.feedback.adjust({ type: 'song', id: track.videoId, name: track.title, artists: track.artists, delta: -1, ignore: true })
        return 'Song wird ignoriert'
      case 'excludeArtist':
        if (!first) return 'Kein Künstler erkannt'
        music.updatePrefs((p) => {
          if (!p.excluded.artists.some((a) => artistKey(a) === aKey)) p.excluded.artists.push({ id: first.id || null, name: first.name })
        })
        return `${first.name} zählt nicht mehr zum Profil`
      case 'excludeSong':
        music.updatePrefs((p) => {
          if (!p.excluded.songs.some((s) => s.videoId === track.videoId)) p.excluded.songs.push({ videoId: track.videoId, title: track.title, artists: track.artists || [] })
        })
        return 'Song zählt nicht mehr zum Profil'
      default:
        return ''
    }
  },

  // ---------- neuerscheinungen ----------

  releases: {
    all() {
      return musicDb().getAll('releases')
    },
    latest(limit = 50) {
      return musicDb().latest('releases', 'firstSeen', limit)
    },
    async markSeen() {
      await setMeta('releasesSeenAt', Date.now())
      emit('releases', null)
    },
    async unseenCount() {
      const seen = (await getMeta('releasesSeenAt', 0)) || 0
      const list = await musicDb().byIndex('releases', 'firstSeen', IDBKeyRange.lowerBound(seen + 1))
      return list.filter((r) => r.fresh).length
    }
  },

  // ---------- profil ----------

  async profile({ now = Date.now() } = {}) {
    if (profileCache && now - profileCache.at < 60 * 1000) return profileCache.value
    if (profilePromise) return profilePromise
    profilePromise = (async () => {
      const p = music.prefs()
      const [plays, favorites, feedback] = await Promise.all([musicDb().getAll('plays'), musicDb().getAll('favorites'), musicDb().getAll('feedback')])
      const value = buildProfile(plays, { favorites, feedback, excluded: p.excluded, now, weights: p.weights, halfLifeDays: p.halfLifeDays })
      value.playsList = plays
      profileCache = { at: Date.now(), value }
      profilePromise = null
      return value
    })().catch((e) => {
      profilePromise = null
      throw e
    })
    return profilePromise
  },

  invalidate,

  // ---------- export und import ----------

  async exportData() {
    const dump = await musicDb().exportAll(USER_STORES)
    dump.prefs = music.prefs()
    dump.app = 'ytx-music'
    return dump
  },

  async importData(dump, { replace = false } = {}) {
    if (!dump || dump.database !== MUSIC_DB || typeof dump.stores !== 'object') throw new Error('keine ytx Music Sicherung')
    const names = await musicDb().importAll(dump, { replace, stores: USER_STORES.filter((s) => Array.isArray(dump.stores[s])) })
    if (dump.prefs) store.updateBucket(PREFS_BUCKET, (p) => Object.assign(p, normalizePrefs(dump.prefs)), normalizePrefs)
    invalidate()
    emit('plays', null)
    emit('favorites', null)
    emit('prefs', music.prefs())
    return names
  },

  db: musicDb,
  getMeta,
  setMeta
}

// aufbewahrung einmal pro start und danach taeglich
export const scheduleRetention = debounce(() => {
  music.history.applyRetention().catch((e) => log.warn('music retention', e))
}, 5000)
