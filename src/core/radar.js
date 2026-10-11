import { applyScan, acknowledge, describeFresh, emptyState, isInteresting } from './radarLogic.js'
import { onSweep } from './observer.js'
import { pageWindow } from './bridge.js'

// Feature Radar, Stand liegt lokal im Browser pro Seite (m.youtube.com, www, music) und wird nicht abgeglichen
const KEY = `ytx.radar.${location.host}`
const EVERY = 45000

let state = emptyState()
let lastScan = 0

const load = () => {
  try {
    return { ...emptyState(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return emptyState()
  }
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
}

function scan(page) {
  const tags = new Set()
  for (const el of document.getElementsByTagName('*')) {
    const n = el.localName
    if (n.includes('-') && isInteresting(n)) tags.add(n)
  }
  // aktive Experiment Schalter dieses Kontos, YouTube verteilt Neuerungen darueber schrittweise
  const flags = []
  try {
    const f = pageWindow.ytcfg?.get?.('EXPERIMENT_FLAGS') || {}
    for (const k of Object.keys(f)) if (f[k] === true || f[k] === 'true') flags.push(k)
  } catch {}
  if (applyScan(state, { tags: [...tags], flags, page, now: Date.now() })) save()
}

export function initRadar(getPage) {
  state = load()
  return onSweep('radar', () => {
    const now = Date.now()
    if (now - lastScan < EVERY) return
    lastScan = now
    scan(getPage?.())
  })
}

export const radarFresh = () => state.fresh
export const radarText = () => describeFresh(state).join('\n')
export function radarAck() {
  const n = acknowledge(state)
  save()
  return n
}
export const radarInfo = () => ({ tags: Object.keys(state.tags).length, flags: Object.keys(state.flags).length, since: state.since })
