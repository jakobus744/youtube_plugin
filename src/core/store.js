import { normalize, normalizeProfile, splitLegacy, SCHEMA, SITE_KEYS } from './config.js'
import { templates, templateById, DEFAULT_ACTIVE } from '../profiles/index.js'
import { sites, site } from '../sites/index.js'
import { debounce } from './scheduler.js'
import { log } from './log.js'

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

const defaultSettings = () => ({ hotkeys: {}, panelButton: true, panelTab: 'display' })

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
  ]
]

let data = null
let config = null
const subs = new Set()
const saveSoon = debounce(() => writeRaw(KEY, data), 250, 1500)

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

function commit(reason) {
  recompute()
  saveSoon()
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
    migrate()
    // neue eingebaute profile nachtragen
    for (const t of templates) {
      if (!data.profiles[t.id] && !data.deletedTemplates?.includes(t.id)) data.profiles[t.id] = { name: t.name, template: t.id, config: t.config() }
    }
    if (!data.profiles[data.active]) data.active = Object.keys(data.profiles)[0]
    recompute()
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
    mutator(draft)
    p.config = { ...(p.config || {}), schema: SCHEMA, [site.id]: normalize(draft, site) }
    commit(reason)
  },

  updateSettings(mutator) {
    mutator(data.settings)
    saveSoon()
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
    saveSoon()
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
    saveSoon()
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
    const out = all ? { ...data, buckets: undefined } : { schema: SCHEMA, profile: { name: p.name, config: normalizeProfile(p.config, sites) } }
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
