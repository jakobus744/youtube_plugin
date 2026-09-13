import { watch } from '../../registry/paths.js'
import { player } from '../../core/bridge.js'
import { waitFor } from '../../core/scheduler.js'
import { onDispose } from '../../core/lifecycle.js'
import { log } from '../../core/log.js'
import { transcriptFromPanel } from './panelSource.js'

// primaerquelle fuer transkripte
// der player fragt untertitel selbst mit proof of origin token an
// diese url wird passiv ueber die performance api gelesen und mit anderer sprache wiederverwendet
// direkte baseUrl abrufe ohne token liefern seit 2025 leere antworten

const tokenUrls = new Map()
export const sourceStats = { captured: 0, observer: false, lastError: null, lastMethod: null }

function record(url) {
  if (!watch.isTimedtextUrl(url)) return
  try {
    const v = new URL(url).searchParams.get('v')
    if (v) {
      tokenUrls.set(v, url)
      sourceStats.captured++
    }
  } catch {}
}

function scanEntries() {
  try {
    for (const e of performance.getEntriesByType('resource')) record(e.name)
  } catch {}
}

export function initTimedtextCapture() {
  scanEntries()
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) record(e.name)
    })
    po.observe({ type: 'resource', buffered: true })
    sourceStats.observer = true
    onDispose(() => po.disconnect())
  } catch (e) {
    log.warn('PerformanceObserver', e)
  }
}

export function hasToken(videoId) {
  if (!tokenUrls.has(videoId)) scanEntries()
  return tokenUrls.has(videoId)
}

export function listTracks(pr = watch.playerResponse()) {
  return watch.captionTracks(pr).map((t) => {
    const u = new URL(t.baseUrl, location.origin)
    const kind = t.kind || u.searchParams.get('kind') || ''
    const name = t.name?.simpleText || t.name?.runs?.map((r) => r.text).join('') || t.languageCode
    return {
      id: t.vssId || `${kind}.${t.languageCode}`,
      lang: t.languageCode,
      kind,
      auto: kind === 'asr',
      label: name,
      baseUrl: t.baseUrl
    }
  })
}

// auto: gewaehlte player spur, sonst manuelle spur in gesprochener sprache, sonst ui sprache, sonst automatisch
export function pickTrack(tracks, { language = 'auto', preferManual = true } = {}) {
  if (!tracks.length) return null
  const manual = (lang) => tracks.find((t) => !t.auto && t.lang.split('-')[0] === lang)
  const auto = (lang) => tracks.find((t) => t.auto && t.lang.split('-')[0] === lang)
  const spoken = tracks.find((t) => t.auto)?.lang.split('-')[0]
  const ui = (document.documentElement.lang || 'de').split('-')[0]
  const order = []
  if (language === 'auto') {
    try {
      const cur = player()?.getOption?.('captions', 'track')
      if (cur?.languageCode) order.push(tracks.find((t) => t.lang === cur.languageCode && (t.kind || '') === (cur.kind || '')))
    } catch {}
  }
  const langs = language === 'ui' ? [ui, spoken] : language === 'auto' || language === 'original' ? [spoken, ui] : [language, spoken, ui]
  for (const l of langs) {
    if (!l) continue
    if (preferManual) order.push(manual(l), auto(l))
    else order.push(auto(l), manual(l))
  }
  order.push(tracks.find((t) => !t.auto), tracks[0])
  return order.find(Boolean)
}

// der player speichert die untertitel vorliebe dauerhaft, diese werte werden gesichert
const CAPTION_PREFS = ['yt-player-caption-persistence', 'yt-player-caption-sticky-language']

function snapshotPrefs() {
  const out = {}
  for (const k of CAPTION_PREFS) {
    try { out[k] = localStorage.getItem(k) } catch {}
  }
  return out
}

function restorePrefs(snap) {
  for (const k of CAPTION_PREFS) {
    try {
      if (snap[k] == null) localStorage.removeItem(k)
      else localStorage.setItem(k, snap[k])
    } catch {}
  }
}

function captionsOn() {
  const btn = document.querySelector('#movie_player .ytp-subtitles-button')
  return btn ? btn.getAttribute('aria-pressed') === 'true' : false
}

async function triggerPlayer(videoId, track) {
  const p = player()
  if (!p) return null
  const prefs = snapshotPrefs()
  const wasOn = captionsOn()
  let prev = null
  try { prev = p.getOption?.('captions', 'track') } catch {}
  try { p.loadModule?.('captions') } catch {}
  try { p.setOption?.('captions', 'track', { languageCode: track.lang, ...(track.kind ? { kind: track.kind } : {}) }) } catch {}
  const url = await waitFor(() => {
    scanEntries()
    return tokenUrls.get(videoId)
  }, { timeout: 7000, interval: 150 })
  // untertitel exakt wie vorher herstellen
  try {
    if (wasOn && prev?.languageCode) p.setOption?.('captions', 'track', prev)
    else if (!wasOn) {
      p.setOption?.('captions', 'track', {})
      p.unloadModule?.('captions')
    }
  } catch {}
  if (!wasOn && captionsOn()) document.querySelector('#movie_player .ytp-subtitles-button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  restorePrefs(prefs)
  sourceStats.lastTrigger = { wasOn, restoredOff: !captionsOn() || wasOn }
  return url
}

function buildUrl(base, track) {
  const u = new URL(base)
  const t = new URL(track.baseUrl, location.origin)
  for (const key of ['lang', 'kind', 'name', 'tlang']) {
    const v = t.searchParams.get(key)
    if (v) u.searchParams.set(key, v)
    else u.searchParams.delete(key)
  }
  if (track.kind) u.searchParams.set('kind', track.kind)
  u.searchParams.set('fmt', 'json3')
  return u.toString()
}

async function load(url) {
  const res = await fetch(url, { credentials: 'include' })
  const text = await res.text()
  if (!res.ok || !text.trim()) return null
  return JSON.parse(text)
}

const cache = new Map()

const adShowing = () => !!document.querySelector('#movie_player.ad-showing')

// reihenfolge: token aus cache, token ueber player anstossen, natives panel
export async function fetchTrack(videoId, track, { onStatus } = {}) {
  const key = `${videoId}|${track.id}`
  if (cache.has(key)) return cache.get(key)
  const t0 = performance.now()
  let json = null
  let base = hasToken(videoId) ? tokenUrls.get(videoId) : null
  if (base) {
    json = await load(buildUrl(base, track))
    if (json) sourceStats.lastMethod = 'Token (bereits vorhanden)'
  }
  let panelTried = false
  const tryPanel = async () => {
    if (panelTried) return null
    panelTried = true
    // panel liefert nur die dort gewaehlte sprache
    onStatus?.('Versuche Transkript-Panel …')
    try {
      const r = await transcriptFromPanel()
      if (r) sourceStats.lastMethod = 'Transkript-Panel (Fallback, Sprache wie im Panel)'
      return r
    } catch (e) {
      log.warn('panel fallback', e)
      return null
    }
  }
  // waehrend werbung hat der player kein inhaltsvideo, panel haengt nicht davon ab
  if (!json && adShowing()) json = await tryPanel()
  if (!json) {
    tokenUrls.delete(videoId)
    if (adShowing()) {
      onStatus?.('Warte auf Werbung …')
      await waitFor(() => !adShowing(), { timeout: 60000, interval: 500 })
    }
    onStatus?.('Lädt …')
    base = await triggerPlayer(videoId, track)
    if (base) {
      json = await load(buildUrl(base, track))
      if (json) sourceStats.lastMethod = 'Token (über Player angefordert)'
    }
  }
  if (!json) json = await tryPanel()
  sourceStats.lastMs = Math.round(performance.now() - t0)
  if (!json || !Array.isArray(json.events)) {
    const state = player()?.getPlayerState?.()
    const hint = adShowing() ? 'Werbung läuft noch' : state === -1 ? 'Video einmal kurz starten und erneut versuchen' : 'YouTube hat keine Untertitel geliefert'
    sourceStats.lastError = hint
    throw new Error(`Transkript nicht verfügbar: ${hint}`)
  }
  sourceStats.lastError = null
  if (sourceStats.lastMethod.startsWith('Token')) cache.set(key, json)
  if (cache.size > 20) cache.delete(cache.keys().next().value)
  return json
}
