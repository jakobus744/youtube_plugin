import { targetById } from '../registry/targets.js'
import { controlById, themes } from '../registry/look.js'
import { presetById, orderGroups, topbarModes } from '../registry/presets.js'
import { behaviorById } from '../behaviors/index.js'

export const SCHEMA = 2

export const FILTER_PAGES = [
  ['home', 'Startseite'],
  ['subscriptions', 'Abos'],
  ['search', 'Suche'],
  ['watch', 'Empfehlungen auf Videoseite'],
  ['channel', 'Kanal'],
  ['playlist', 'Playlists']
]

export function defaultFilters() {
  return {
    enabled: false,
    mode: 'dim',
    pages: ['home', 'subscriptions', 'search', 'watch'],
    shorts: false,
    live: false,
    channels: { block: [], allowOnly: [] },
    title: { keywords: [], regex: [], caseSensitive: false },
    duration: { minSec: null, maxSec: null },
    age: { maxDays: null },
    watched: { hide: false, minPercent: 90 }
  }
}

export function emptyConfig() {
  return {
    schema: SCHEMA,
    display: {},
    vars: { theme: '' },
    layout: { presets: {}, order: {}, topbar: '', zones: null },
    behavior: {},
    filters: defaultFilters(),
    features: {}
  }
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x)
const strList = (x) => (Array.isArray(x) ? x.map((s) => String(s).trim()).filter(Boolean) : [])
const numOrNull = (x) => (x === '' || x === null || x === undefined || !isFinite(Number(x)) ? null : Number(x))

// bereinigt eine config gegen die registries
// unbekannte eintraege fliegen raus damit alte configs nach updates nicht stoeren
export function normalize(raw, featureManifests = []) {
  const src = isObj(raw) ? raw : {}
  const cfg = emptyConfig()

  if (isObj(src.display)) {
    for (const [id, mode] of Object.entries(src.display)) {
      const t = targetById[id]
      if (t && t.modes.includes(mode) && mode !== 'show') cfg.display[id] = mode
    }
  }

  if (isObj(src.vars)) {
    if (themes.some((t) => t.id === src.vars.theme)) cfg.vars.theme = src.vars.theme
    for (const [id, v] of Object.entries(src.vars)) {
      if (id === 'theme') continue
      const c = controlById[id]
      if (!c || v === '' || v === null || v === undefined) continue
      if (c.type === 'range') {
        const n = Number(v)
        if (isFinite(n)) cfg.vars[id] = Math.min(c.max, Math.max(c.min, n))
      } else if (c.type === 'color') {
        if (/^#[0-9a-f]{3,8}$/i.test(v)) cfg.vars[id] = v
      } else if (c.type === 'select') {
        if (c.options.some(([val]) => val === v)) cfg.vars[id] = v
      }
    }
  }

  if (isObj(src.layout)) {
    if (isObj(src.layout.presets)) {
      for (const [page, id] of Object.entries(src.layout.presets)) {
        const p = presetById[id]
        if (p && p.pages.includes(page)) cfg.layout.presets[page] = id
      }
    }
    if (isObj(src.layout.order)) {
      for (const [gid, list] of Object.entries(src.layout.order)) {
        const g = orderGroups[gid]
        if (!g) continue
        const known = new Set(g.items.map(([id]) => id))
        const clean = strList(list).filter((id) => known.has(id))
        if (clean.length) cfg.layout.order[gid] = [...new Set(clean)]
      }
    }
    if (topbarModes.some(([v]) => v === src.layout.topbar)) cfg.layout.topbar = src.layout.topbar
    if (isObj(src.layout.zones)) cfg.layout.zones = src.layout.zones
  }

  if (isObj(src.behavior)) {
    for (const [id, v] of Object.entries(src.behavior)) {
      const b = behaviorById[id]
      if (!b) continue
      if (b.type === 'toggle') cfg.behavior[id] = !!v
      else if (b.type === 'select' && b.options.some(([val]) => val === v)) cfg.behavior[id] = v
      else if (b.type === 'textarea') cfg.behavior[id] = String(v ?? '')
    }
  }

  if (isObj(src.filters)) {
    const f = src.filters
    const d = cfg.filters
    d.enabled = !!f.enabled
    if (['dim', 'collapse', 'hide'].includes(f.mode)) d.mode = f.mode
    if (Array.isArray(f.pages)) d.pages = strList(f.pages)
    d.shorts = !!f.shorts
    d.live = !!f.live
    d.channels.block = strList(f.channels?.block)
    d.channels.allowOnly = strList(f.channels?.allowOnly)
    d.title.keywords = strList(f.title?.keywords)
    d.title.regex = strList(f.title?.regex)
    d.title.caseSensitive = !!f.title?.caseSensitive
    d.duration.minSec = numOrNull(f.duration?.minSec)
    d.duration.maxSec = numOrNull(f.duration?.maxSec)
    d.age.maxDays = numOrNull(f.age?.maxDays)
    d.watched.hide = !!f.watched?.hide
    d.watched.minPercent = numOrNull(f.watched?.minPercent) ?? 90
  }

  const srcFeatures = isObj(src.features) ? src.features : {}
  for (const m of featureManifests) {
    const s = isObj(srcFeatures[m.id]) ? srcFeatures[m.id] : {}
    const out = { enabled: !!s.enabled }
    for (const [key, def] of Object.entries(m.settings || {})) {
      out[key] = normalizeSetting(def, s[key])
    }
    cfg.features[m.id] = out
  }

  return cfg
}

export function normalizeSetting(def, v) {
  switch (def.type) {
    case 'toggle':
      return v === undefined ? !!def.default : !!v
    case 'select':
      return def.options.some(([val]) => val === v) ? v : def.default
    case 'multi': {
      const allowed = new Set(def.options.map(([val]) => val))
      return Array.isArray(v) ? v.filter((x) => allowed.has(x)) : def.default.slice()
    }
    case 'range': {
      const n = Number(v)
      return isFinite(n) && v !== null && v !== '' ? Math.min(def.max, Math.max(def.min, n)) : def.default
    }
    case 'text':
      return typeof v === 'string' ? v : def.default
    default:
      return v ?? def.default
  }
}
