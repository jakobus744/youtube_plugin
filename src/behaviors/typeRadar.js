import { pageWindow } from '../core/bridge.js'
import { onYtResponse } from '../core/ytResponses.js'
import { collectTypes, siteOfHost } from '../core/ytTypes.js'
import { KNOWN_TYPES } from '../registry/knownTypes.js'
import { extractInitialData } from '../registry/music/initialData.js'

// merkt sich bausteine aus den youtube daten, die ytx noch nicht kennt
// so faellt ein neues regal oder eine neue werbeform auf, auch wenn noch nichts kaputt ist

const KEY = 'ytx.newTypes'
const MAX = 200
let site = ''
let known = new Set()

function init() {
  if (site) return
  site = siteOfHost(location.hostname)
  known = new Set(KNOWN_TYPES[site] || [])
}
const seen = new Map()

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

let saved = null
let timer = 0

function remember(types) {
  init()
  saved ||= load()
  let changed = false
  for (const [name, parent] of types) {
    if (!seen.has(name)) seen.set(name, parent)
    if (known.has(name)) continue
    const e = saved[name]
    if (e) {
      e.n++
      e.last = new Date().toISOString().slice(0, 10)
    } else if (Object.keys(saved).length < MAX) {
      saved[name] = { first: new Date().toISOString().slice(0, 10), last: new Date().toISOString().slice(0, 10), parent, page: location.pathname, n: 1 }
    }
    changed = true
  }
  if (changed && !timer) {
    timer = setTimeout(() => {
      timer = 0
      try {
        localStorage.setItem(KEY, JSON.stringify(saved))
      } catch {}
    }, 2000)
  }
}

// gemerkte unbekannte bausteine, schon eingeordnete fallen heraus
export function newTypes() {
  init()
  saved ||= load()
  return Object.entries(saved)
    .filter(([name]) => !known.has(name))
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => (a.first < b.first ? 1 : -1))
}

function scanInitial() {
  init()
  const w = pageWindow
  const out = new Map()
  collectTypes(w.ytInitialData, out)
  collectTypes(w.ytInitialPlayerResponse, out)
  // music schreibt die startdaten als initialData.push in die seite
  if (site === 'music') {
    for (const s of document.scripts) {
      if (s.src || !s.textContent.includes('initialData.push')) continue
      for (const b of extractInitialData(s.textContent)) collectTypes(b.data, out)
    }
  }
  remember(out)
}

export const typeRadar = {
  id: 'typeRadar',
  label: 'Neue YouTube-Bausteine erkennen',
  description: 'Merkt sich, wenn YouTube Seitenteile ausliefert, die ytx noch nicht kennt (neue Regale, Werbeformen, Umbauten). Zu sehen unter Diagnose',
  type: 'toggle',
  default: true,
  start() {
    // alle bausteine dieser sitzung, fuer das pflegen der liste
    pageWindow.__ytxTypes = () => Object.fromEntries(seen)
    const t = setTimeout(scanInitial, 1500)
    const off = onYtResponse((j) => remember(collectTypes(j)))
    return () => {
      clearTimeout(t)
      off()
    }
  },
  health() {
    const list = newTypes()
    if (!list.length) return { status: 'ok', detail: `${seen.size} Bausteine gesehen, alle bekannt` }
    return { status: 'warn', detail: `${list.length} neue: ${list.slice(0, 8).map((e) => `${e.name} (in ${e.parent || '?'}, seit ${e.first})`).join(', ')}${list.length > 8 ? ' …' : ''}` }
  }
}
