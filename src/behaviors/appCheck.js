import { pageWindow } from '../core/bridge.js'
import { runChecks, summarize } from '../core/diagnose.js'
import { heatmapFor } from './heatmap.js'

// pruefmodus fuer tools/phone-check.mjs, nur in der app und nur wenn die seite mit #ytxcheck geoeffnet wurde
// meldet dann alle 1,5 s den zustand der seite ins android log, das skript liest ihn per adb aus

const KEY = 'ytx.appCheck'

// sofort beim laden lesen, youtube raeumt die adresse spaeter auf
try {
  if (/ytxcheck/.test(location.hash)) sessionStorage.setItem(KEY, '1')
} catch {}

const round = (n) => Math.round(n * 10) / 10

function box(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  // youtube schaltet manche leisten selbst unsichtbar und nur den inhalt sichtbar, deshalb zaehlt was an der stelle oben liegt
  let shown = r.width > 0 && r.height > 0 && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight
  let hit = null
  if (shown) {
    hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20))
    shown = !!hit && (hit === el || el.contains(hit) || !!hit.closest?.('[data-ytx-own]'))
  }
  const out = { shown, y: Math.round(r.top), h: Math.round(r.height) }
  if (hit && !shown) out.cover = `${hit.localName}${hit.id ? '#' + hit.id : ''}.${String(hit.className?.baseVal ?? hit.className).split(' ')[0]}`
  return out
}

function media() {
  const v = document.querySelector('#movie_player video, ytmusic-player video, video')
  if (!v) return null
  return { ready: v.readyState, paused: v.paused, t: round(v.currentTime), muted: v.muted }
}

export function report() {
  const host = location.hostname
  const r = {
    t: Date.now(),
    host,
    path: location.pathname + location.search.slice(0, 20),
    size: `${innerWidth}x${innerHeight}`,
    version: pageWindow.__ytx?.version || null,
    media: media(),
    fullscreen: !!document.fullscreenElement
  }
  try {
    r.diag = summarize(runChecks())
  } catch {}
  if (host.startsWith('music.')) {
    const layout = document.querySelector('ytmusic-app-layout')
    r.ui = layout?.getAttribute('player-ui-state') || null
    // im player steckt eine zweite ytmusic-player-bar, gemeint ist die leiste unten am layout
    r.bar = box(document.querySelector('ytmusic-app-layout > ytmusic-miniplayer') || document.querySelector('ytmusic-app-layout > ytmusic-player-bar') || document.querySelector('ytmusic-player-bar'))
    r.nav = box(document.getElementById('ytx-mnav'))
    r.avToggle = box(document.querySelector('ytmusic-player-page ytmusic-av-toggle'))
    r.history = history.length
    r.homeBelow = !!history.state?.ytxHome
  } else {
    const id = new URLSearchParams(location.search).get('v')
    r.feed = document.querySelectorAll('ytm-rich-item-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer').length
    r.player = box(document.getElementById('movie_player'))
    r.heatmap = id ? !!heatmapFor(id) : null
    r.adWait = !!document.querySelector('.ytx-adwait')
  }
  return r
}

export const appCheck = {
  id: 'appCheck',
  label: 'Prüfmodus für das Prüfskript (App)',
  description: 'Nur für tools/phone-check.mjs: Ist eine Seite mit #ytxcheck geöffnet, meldet ytx ihren Zustand ins Android-Log. Sonst passiert nichts',
  type: 'toggle',
  default: true,
  start() {
    let on = false
    try {
      on = sessionStorage.getItem(KEY) === '1'
    } catch {}
    if (!window.__ytxNative || !on) return () => {}
    const send = () => {
      try {
        window.__ytxAppLog?.('YTXCHECK ' + JSON.stringify(report()))
      } catch (e) {
        window.__ytxAppLog?.('YTXCHECK ' + JSON.stringify({ t: Date.now(), error: e.message }))
      }
    }
    send()
    const timer = setInterval(send, 1500)
    return () => clearInterval(timer)
  }
}
