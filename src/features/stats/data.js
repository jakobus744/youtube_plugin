import { site } from '../../sites/index.js'
import { cloudReady, cloudRequest } from '../../core/cloudSync.js'
import { deviceId } from '../../core/device.js'
import { openDatabase } from '../../core/idb.js'
import { log } from '../../core/log.js'
import { ytDb } from '../youtube/watchtime/db.js'
import { music } from '../music/runtime.js'
import { groupsData } from '../youtube/subGroups/index.js'
import { groupsOf } from '../youtube/subGroups/logic.js'
import { fromViews, fromPlays } from './logic.js'
import { parseDavList } from './dav.js'

// ereignisse fuer die statistik: eigene aus indexeddb, andere geraete und seiten aus der nextcloud
// nextcloud: ytx/history/<geraet>/<seite>-<jahr-monat>.json, jede seite schreibt nur ihre eigenen dateien

const isMusic = () => site.id === 'music'
const SRC = () => (isMusic() ? 'music' : 'yt')

export async function localEvents(from = 0) {
  if (isMusic()) return fromPlays(await music.history.list({ from }))
  const views = await ytDb().byIndex('views', 'startedAt', IDBKeyRange.lowerBound(from))
  const data = groupsData()
  return fromViews(views, (ch) => groupsOf(ch, data).map((g) => g.name))
}

// fremde dateien zwischenspeichern, damit nur geaenderte neu geladen werden
let cacheDb = null
const cache = () => (cacheDb ||= openDatabase('ytx-stats', [(db) => db.createObjectStore('remote', { keyPath: 'path' })]))

const monthKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// eigene monate hochladen, standard: dieser und der vorige monat
export async function pushHistory({ months = 2 } = {}) {
  if (!cloudReady()) return { pushed: 0, skipped: 'Nextcloud nicht eingerichtet' }
  const dev = deviceId()
  const now = new Date()
  const from = +new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const events = await localEvents(from)
  for (const dir of ['history', `history/${dev}`]) {
    const r = await cloudRequest('MKCOL', dir)
    if (![201, 405].includes(r.status)) throw new Error(`Nextcloud ${dir}: HTTP ${r.status}`)
  }
  const byMonth = new Map()
  for (const e of events) {
    const k = monthKey(e.start)
    if (!byMonth.has(k)) byMonth.set(k, [])
    byMonth.get(k).push(e)
  }
  let pushed = 0
  for (const [month, list] of byMonth) {
    const body = JSON.stringify({ v: 1, device: dev, site: site.id, src: SRC(), month, at: Date.now(), events: list })
    const r = await cloudRequest('PUT', `history/${dev}/${site.id}-${month}.json`, body)
    if (r.status < 200 || r.status >= 300) throw new Error(`Nextcloud hochladen: HTTP ${r.status}`)
    pushed += list.length
  }
  return { pushed, months: byMonth.size }
}

const LIST_BODY = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>'

async function listDir(path) {
  const r = await cloudRequest('PROPFIND', path, LIST_BODY, { Depth: '1', 'Content-Type': 'application/xml' })
  if (r.status === 404) return []
  if (r.status !== 207) throw new Error(`Nextcloud Liste: HTTP ${r.status}`)
  return parseDavList(r.text).slice(1)
}

// alles ausser den eigenen dateien dieser seite, geaenderte neu laden
export async function remoteEvents() {
  if (!cloudReady()) return { events: [], files: 0, note: 'Nextcloud nicht eingerichtet, nur Daten dieses Geräts' }
  const dev = deviceId()
  const db = cache()
  const events = []
  let files = 0
  const devices = (await listDir('history')).filter((x) => x.dir)
  for (const d of devices) {
    for (const f of await listDir(`history/${d.name}`)) {
      if (f.dir || !f.name.endsWith('.json')) continue
      if (d.name === dev && f.name.startsWith(`${site.id}-`)) continue
      const path = `history/${d.name}/${f.name}`
      let hit = await db.get('remote', path).catch(() => null)
      if (!hit || hit.etag !== f.etag) {
        const r = await cloudRequest('GET', path)
        if (r.status !== 200) continue
        try {
          const j = JSON.parse(r.text)
          hit = { path, etag: f.etag, device: j.device, site: j.site, events: Array.isArray(j.events) ? j.events : [] }
          await db.put('remote', hit)
        } catch (e) {
          log.warn(`statistik ${path}`, e)
          continue
        }
      }
      files++
      events.push(...hit.events)
    }
  }
  return { events, files, devices: devices.length }
}

// nur zwischengespeichertes, ohne netz, fuer den schnellen ersten aufbau
export async function cachedRemote() {
  try {
    const dev = deviceId()
    const all = await cache().getAll('remote')
    return all.filter((x) => !(x.device === dev && x.site === site.id)).flatMap((x) => x.events)
  } catch {
    return []
  }
}
