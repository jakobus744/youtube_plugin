import { normalize, normalizeProfile, splitLegacy, SCHEMA, SITE_KEYS } from './config.js'
import { templates, templateById, DEFAULT_ACTIVE } from '../profiles/index.js'
import { tidyFeatures as mobileTidyFeatures } from '../profiles/mobile.js'
import { sites, site } from '../sites/index.js'
import { debounce } from './scheduler.js'
import { log } from './log.js'
import { merge3, same } from './merge.js'

// profile gelten fuer beide seiten, jede seite hat ihren eigenen abschnitt
// buckets sind seitenweite einstellungen ausserhalb der profile

const KEY = 'ytx.store'
const STATE_KEY = 'ytx.state'

const hasGM = () => typeof GM_getValue === 'function' && typeof GM_setValue === 'function'

function readRaw(key) {
  try {
    if (hasGM()) {
      const v = GM_getValue(key, null)
      if (v != null) return typeof v === 'string' ? JSON.parse(v) : v
    }
  } catch (e) {
    log.warn('GM_getValue', e)
  }
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}

function writeRaw(key, value) {
  const json = JSON.stringify(value)
  try {
    if (hasGM()) {
      GM_setValue(key, json)
      return
    }
  } catch (e) {
    log.warn('GM_setValue', e)
  }
  try { localStorage.setItem(key, json) } catch (e) { log.warn('localStorage', e) }
}

function slug(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c])
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'profil'
  )
}

const defaultSettings = () => ({ hotkeys: {}, panelButton: true, panelTab: 'display', linkLook: true })

function freshData() {
  const profiles = {}
  for (const t of templates) profiles[t.id] = { name: t.name, template: t.id, config: t.config() }
  return { schema: SCHEMA, active: DEFAULT_ACTIVE, profiles, settings: defaultSettings(), buckets: {}, migrations: MIGRATIONS.map(([id]) => id) }
}

// einmalige anpassungen gespeicherter daten, reihenfolge ist wichtig
const MIGRATIONS = [
  [
    'schema-3-sites',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        const split = splitLegacy(p.config)
        p.config = { schema: SCHEMA, ...split }
        const t = templateById[p.template]
        // music abschnitt fuer bestehende profile aus der vorlage uebernehmen
        if (!p.config.music && t) p.config.music = t.config().music
      }
      d.schema = SCHEMA
    }
  ],
  [
    'thumbs-color-default',
    (d) => {
      const p = d.profiles.aufgeraeumt
      const disp = p?.config?.youtube?.display
      if (p?.template === 'aufgeraeumt' && disp?.['thumb.image'] === 'dim') delete disp['thumb.image']
    }
  ],
  [
    // neue features in bestehenden profilen einschalten, ausser im original profil
    'playlist-search-on',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        if (p.template === 'youtube' || !p.config?.youtube) continue
        const f = (p.config.youtube.features ||= {})
        if (!f['playlist.search']) f['playlist.search'] = { enabled: true }
      }
    }
  ],
  [
    'groups-watchtime-weekly-on',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        if (p.template === 'youtube') continue
        if (p.config?.youtube) {
          const f = (p.config.youtube.features ||= {})
          f['subs.groups'] ||= { enabled: true }
          f['watch.time'] ||= { enabled: true }
        }
        if (p.config?.music) {
          const f = (p.config.music.features ||= {})
          f['m.weekly'] ||= { enabled: true }
        }
      }
    }
  ],
  [
    // mobil abschnitt fuer bestehende profile aus der vorlage
    'mobile-section',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        if (!p.config || p.config.mobile) continue
        const t = templateById[p.template] || templateById.aufgeraeumt
        p.config.mobile = p.template === 'youtube' ? {} : t.config().mobile
      }
    }
  ],
  [
    'mobile-open-app-hidden',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        const m = p.config?.mobile
        if (!m || p.template === 'youtube') continue
        m.display ||= {}
        if (!('mb.top.openApp' in m.display)) m.display['mb.top.openApp'] = 'hide'
      }
    }
  ],
  [
    'transcript-menu-item',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        const f = p.config?.youtube?.features?.['transcript.copy']
        if (Array.isArray(f?.placement) && !f.placement.includes('menu')) f.placement.push('menu')
      }
    }
  ],
  [
    // handy bekommt die features vom rechner, bestehende profile schalten sie wie die vorlage ein
    'mobile-desktop-features',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        const m = p.config?.mobile
        if (!m || p.template === 'youtube') continue
        const f = (m.features ||= {})
        for (const [id, v] of Object.entries(mobileTidyFeatures)) if (!f[id]) f[id] = { ...v }
        const b = (m.behavior ||= {})
        if (!('autoplayOff' in b)) b.autoplayOff = true
        if (!('channelTrailerPause' in b)) b.channelTrailerPause = true
      }
    }
  ],
  [
    'mobile-swipe-down-back',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        const m = p.config?.mobile
        if (!m || p.template === 'youtube') continue
        const b = (m.behavior ||= {})
        if (!('swipeDownBack' in b)) b.swipeDownBack = true
      }
    }
  ],
  [
    'music-open-app-hidden',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        const m = p.config?.music
        if (!m || p.template === 'youtube') continue
        m.display ||= {}
        if (!('m.nav.openApp' in m.display)) m.display['m.nav.openApp'] = 'hide'
      }
    }
  ],
  [
    'music-sleep-timer-on',
    (d) => {
      for (const p of Object.values(d.profiles || {})) {
        if (p.template === 'youtube' || !p.config?.music) continue
        const f = (p.config.music.features ||= {})
        f['m.sleepTimer'] ||= { enabled: true }
      }
    }
  ],
  [
    // theme und farben gelten fuer youtube und music gemeinsam, wer es ausdruecklich ausgeschaltet hat behaelt das
    'link-look-default-on',
    (d) => {
      d.settings ||= {}
      if (!('linkLook' in d.settings)) d.settings.linkLook = true
    }
  ]
]

let data = null
let syncMode = 'none'
let config = null
const subs = new Set()
// base ist der zuletzt gemeinsame stand mit dem speicher
// andere tabs (youtube und music) schreiben denselben schluessel
let base = null
let pending = false

function persist() {
  pending = false
  const stored = readRaw(KEY)
  if (stored && base && JSON.stringify(stored) !== base) {
    // anderer tab hat inzwischen gespeichert, eigene aenderungen darauf setzen
    const merged = structuredClone(merge3(JSON.parse(base), data, stored))
    const changed = !same(merged, data)
    data = merged
    if (changed) {
      recompute()
      emit('sync')
    }
  }
  writeRaw(KEY, data)
  base = JSON.stringify(data)
}
const saveSoon = debounce(persist, 250, 1500)
const markDirty = () => {
  pending = true
  saveSoon()
}

// aenderung aus einem anderen tab uebernehmen
function onRemote(raw) {
  let remote
  try {
    remote = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return
  }
  if (!remote?.profiles || !Object.keys(remote.profiles).length) return
  const json = JSON.stringify(remote)
  if (json === base) return
  data = structuredClone(pending ? merge3(JSON.parse(base), data, remote) : remote)
  base = json
  data.settings ||= defaultSettings()
  data.buckets ||= {}
  if (!data.profiles[data.active]) data.active = Object.keys(data.profiles)[0]
  recompute()
  emit('sync')
}

function watchRemote() {
  try {
    if (typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener(KEY, (name, oldValue, newValue, remote) => remote && onRemote(newValue))
      return 'gm'
    }
  } catch (e) {
    log.warn('GM_addValueChangeListener', e)
  }
  // ohne gm nur tabs derselben seite
  window.addEventListener('storage', (e) => e.key === KEY && e.newValue && onRemote(e.newValue))
  return 'storage'
}

let runtime = readRaw(STATE_KEY) || {}
const saveState = debounce(() => writeRaw(STATE_KEY, runtime), 500, 3000)

function migrate() {
  data.migrations ||= []
  let changed = false
  for (const [id, fn] of MIGRATIONS) {
    if (data.migrations.includes(id)) continue
    try { fn(data) } catch (e) { log.warn(`migration ${id}`, e) }
    data.migrations.push(id)
    changed = true
  }
  if (changed) writeRaw(KEY, data)
  base = JSON.stringify(data)
}

function activeProfile() {
  return data.profiles[data.active] || data.profiles[Object.keys(data.profiles)[0]]
}

function recompute() {
  config = normalize(activeProfile()?.config?.[site.id], site)
}

function emit(reason) {
  for (const fn of subs) {
    try { fn(config, reason) } catch (e) { log.error('store subscriber', e) }
  }
}

// geaenderte look werte auf die anderen seiten des profils uebertragen
// was es dort nicht gibt verwirft normalize
function linkVars(p, oldVars, newVars) {
  for (const id of SITE_KEYS) {
    if (id === site.id) continue
    const other = normalize(p.config?.[id], sites[id])
    let touched = false
    for (const k of new Set([...Object.keys(oldVars), ...Object.keys(newVars)])) {
      if (same(oldVars[k], newVars[k])) continue
      if (newVars[k] === undefined) delete other.vars[k]
      else other.vars[k] = newVars[k]
      touched = true
    }
    if (touched) p.config = { ...(p.config || {}), schema: SCHEMA, [id]: normalize(other, sites[id]) }
  }
}

function commit(reason) {
  recompute()
  markDirty()
  emit(reason)
}

export const store = {
  init() {
    data = readRaw(KEY)
    if (!data || typeof data !== 'object' || !data.profiles || !Object.keys(data.profiles).length) {
      data = freshData()
      writeRaw(KEY, data)
    }
    data.settings ||= defaultSettings()
    data.buckets ||= {}
    base = JSON.stringify(data)
    migrate()
    // neue eingebaute profile nachtragen
    for (const t of templates) {
      if (!data.profiles[t.id] && !data.deletedTemplates?.includes(t.id)) data.profiles[t.id] = { name: t.name, template: t.id, config: t.config() }
    }
    if (!data.profiles[data.active]) data.active = Object.keys(data.profiles)[0]
    recompute()
    syncMode = watchRemote()
    // entprelltes speichern vor dem verlassen der seite nachholen
    const flush = () => this.flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => document.hidden && flush())
  },

  flush() {
    saveSoon.flush()
    saveState.flush()
  },

  get config() {
    return config
  },
  get data() {
    return data
  },
  get settings() {
    return data.settings
  },
  get activeId() {
    return data.active
  },
  get siteId() {
    return site.id
  },
  get syncMode() {
    return syncMode
  },
  profiles() {
    return Object.entries(data.profiles).map(([id, p]) => ({ id, name: p.name, template: p.template, active: id === data.active }))
  },

  subscribe(fn) {
    subs.add(fn)
    return () => subs.delete(fn)
  },

  // mutator bekommt den abschnitt der aktuellen seite
  update(mutator, reason = 'update') {
    const p = activeProfile()
    const draft = normalize(p.config?.[site.id], site)
    const oldVars = { ...draft.vars }
    mutator(draft)
    const next = normalize(draft, site)
    p.config = { ...(p.config || {}), schema: SCHEMA, [site.id]: next }
    if (data.settings.linkLook) linkVars(p, oldVars, next.vars)
    commit(reason)
  },

  get linkLook() {
    return !!data.settings.linkLook
  },

  // look beider seiten koppeln, beim einschalten einmal alle profile angleichen
  setLinkLook(on) {
    data.settings.linkLook = !!on
    if (on) for (const p of Object.values(data.profiles)) linkVars(p, {}, normalize(p.config?.[site.id], site).vars)
    commit('profile')
  },

  // look (theme/farben/dichte/typografie) der jeweils anderen seite im selben profil
  // dient dazu, den style zwischen youtube und music zu uebertragen
  otherLooks() {
    const p = activeProfile()
    return SITE_KEYS.filter((id) => id !== site.id).map((id) => ({
      id,
      label: sites[id].label,
      vars: normalize(p.config?.[id], sites[id]).vars
    }))
  },

  updateSettings(mutator) {
    mutator(data.settings)
    markDirty()
    emit('settings')
  },

  // seitenweite einstellungen, normalisiert vom besitzer des buckets
  bucket(name, normalizeFn) {
    const b = normalizeFn ? normalizeFn(data.buckets[name]) : data.buckets[name]
    return b
  },

  updateBucket(name, mutator, normalizeFn) {
    const draft = normalizeFn ? normalizeFn(data.buckets[name]) : structuredClone(data.buckets[name] || {})
    mutator(draft)
    data.buckets[name] = normalizeFn ? normalizeFn(draft) : draft
    markDirty()
    emit(`bucket:${name}`)
    return data.buckets[name]
  },

  setActive(id) {
    if (!data.profiles[id] || id === data.active) return
    data.active = id
    commit('profile')
  },

  cycleProfile() {
    const ids = Object.keys(data.profiles)
    const i = ids.indexOf(data.active)
    this.setActive(ids[(i + 1) % ids.length])
    return data.profiles[data.active].name
  },

  createProfile(name, fromId = data.active) {
    let id = slug(name)
    while (data.profiles[id]) id += '-2'
    const src = data.profiles[fromId]
    data.profiles[id] = { name: String(name).trim() || 'Profil', template: null, config: structuredClone(src ? src.config : {}) }
    data.active = id
    commit('profile')
    return id
  },

  renameProfile(id, name) {
    if (!data.profiles[id] || !String(name).trim()) return
    data.profiles[id].name = String(name).trim()
    markDirty()
    emit('profile')
  },

  deleteProfile(id) {
    if (!data.profiles[id] || Object.keys(data.profiles).length <= 1) return false
    if (data.profiles[id].template) (data.deletedTemplates ||= []).push(data.profiles[id].template)
    delete data.profiles[id]
    if (data.active === id) data.active = Object.keys(data.profiles)[0]
    commit('profile')
    return true
  },

  // setzt nur den abschnitt der aktuellen seite zurueck
  resetProfile(id, allSites = false) {
    const p = data.profiles[id]
    if (!p) return
    const t = templateById[p.template]
    const fresh = t ? t.config() : {}
    p.config = allSites ? fresh : { ...(p.config || {}), schema: SCHEMA, [site.id]: fresh[site.id] || {} }
    commit('profile')
  },

  exportJson(all = false) {
    const p = activeProfile()
    const out = all ? { ...data, buckets: undefined, settings: { ...data.settings, cloud: undefined } } : { schema: SCHEMA, profile: { name: p.name, config: normalizeProfile(p.config, sites) } }
    return JSON.stringify(out, null, 2)
  },

  importJson(text) {
    const obj = JSON.parse(text)
    if (obj.profiles && typeof obj.profiles === 'object') {
      for (const [id, p] of Object.entries(obj.profiles)) {
        if (!p || typeof p !== 'object') continue
        data.profiles[id] = { name: String(p.name || id), template: p.template ?? null, config: normalizeProfile(p.config, sites) }
      }
      if (obj.active && data.profiles[obj.active]) data.active = obj.active
      if (obj.settings) data.settings = { ...data.settings, ...obj.settings }
      commit('import')
      return 'Alle Profile importiert'
    }
    const cfg = obj.profile?.config || obj.config || obj
    const name = obj.profile?.name || 'Importiert'
    const id = this.createProfile(name)
    data.profiles[id].config = normalizeProfile(cfg, sites)
    commit('import')
    return `Profil „${name}“ importiert`
  },

  resetAll() {
    const buckets = data.buckets
    data = freshData()
    data.buckets = buckets
    commit('reset')
  },

  state: {
    get(key, def) {
      return key in runtime ? runtime[key] : def
    },
    set(key, value) {
      runtime[key] = value
      saveState()
    }
  }
}

export { SITE_KEYS }
