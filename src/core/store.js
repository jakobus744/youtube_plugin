import { normalize, SCHEMA } from './config.js'
import { templates, templateById, DEFAULT_ACTIVE } from '../profiles/index.js'
import { debounce } from './scheduler.js'
import { log } from './log.js'

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

function freshData() {
  const profiles = {}
  for (const t of templates) profiles[t.id] = { name: t.name, template: t.id, config: t.config() }
  return { schema: SCHEMA, active: DEFAULT_ACTIVE, profiles, settings: { hotkeys: {}, panelButton: true, panelTab: 'display' } }
}

let featureManifests = []
let data = null
let config = null
const subs = new Set()
const saveSoon = debounce(() => writeRaw(KEY, data), 250, 1500)

let runtime = readRaw(STATE_KEY) || {}
const saveState = debounce(() => writeRaw(STATE_KEY, runtime), 500, 3000)

function recompute() {
  const p = data.profiles[data.active] || data.profiles[Object.keys(data.profiles)[0]]
  config = normalize(p?.config, featureManifests)
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
  init(manifests) {
    featureManifests = manifests
    data = readRaw(KEY)
    if (!data || typeof data !== 'object' || !data.profiles || !Object.keys(data.profiles).length) {
      data = freshData()
      writeRaw(KEY, data)
    }
    data.settings ||= { hotkeys: {}, panelButton: true, panelTab: 'display' }
    // neue eingebaute profile nachtragen
    for (const t of templates) {
      if (!data.profiles[t.id] && !data.deletedTemplates?.includes(t.id)) data.profiles[t.id] = { name: t.name, template: t.id, config: t.config() }
    }
    if (!data.profiles[data.active]) data.active = Object.keys(data.profiles)[0]
    recompute()
    // entprelltes speichern vor dem verlassen der seite nachholen
    const flush = () => {
      saveSoon.flush()
      saveState.flush()
    }
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
  profiles() {
    return Object.entries(data.profiles).map(([id, p]) => ({ id, name: p.name, template: p.template, active: id === data.active }))
  },

  subscribe(fn) {
    subs.add(fn)
    return () => subs.delete(fn)
  },

  // mutator bekommt die rohe config des aktiven profils
  update(mutator, reason = 'update') {
    const p = data.profiles[data.active]
    const draft = normalize(p.config, featureManifests)
    mutator(draft)
    p.config = normalize(draft, featureManifests)
    commit(reason)
  },

  updateSettings(mutator) {
    mutator(data.settings)
    saveSoon()
    emit('settings')
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

  resetProfile(id) {
    const p = data.profiles[id]
    if (!p) return
    const t = templateById[p.template]
    p.config = t ? t.config() : {}
    commit('profile')
  },

  exportJson(all = false) {
    const out = all ? data : { schema: SCHEMA, profile: { name: data.profiles[data.active].name, config: normalize(data.profiles[data.active].config, featureManifests) } }
    return JSON.stringify(out, null, 2)
  },

  importJson(text) {
    const obj = JSON.parse(text)
    if (obj.profiles && typeof obj.profiles === 'object') {
      for (const [id, p] of Object.entries(obj.profiles)) {
        if (!p || typeof p !== 'object') continue
        data.profiles[id] = { name: String(p.name || id), template: p.template ?? null, config: normalize(p.config, featureManifests) }
      }
      if (obj.active && data.profiles[obj.active]) data.active = obj.active
      if (obj.settings) data.settings = { ...data.settings, ...obj.settings }
      commit('import')
      return 'Alle Profile importiert'
    }
    const cfg = obj.profile?.config || obj.config || obj
    const name = obj.profile?.name || 'Importiert'
    const id = this.createProfile(name)
    data.profiles[id].config = normalize(cfg, featureManifests)
    commit('import')
    return `Profil „${name}“ importiert`
  },

  resetAll() {
    data = freshData()
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
