import { qsa, h } from '../core/dom.js'
import { setCss } from '../core/css.js'
import { listen } from '../core/lifecycle.js'
import { audioFocus } from './appAudio.js'

// verhalten fuer music
// start(ctx, value) liefert eine stop funktion

function clickConfirm(dialog) {
  const btn = dialog.querySelector('yt-button-renderer#confirm-button button, #confirm-button button, yt-button-renderer button, button')
  if (!btn) return false
  btn.click()
  return true
}

// wischen auf dem cover oder der playerleiste wechselt den titel, wie in der music app
const SWIPE_ZONE = 'ytmusic-player-bar, ytmusic-player-page #song-image, ytmusic-player-page ytmusic-player, ytmusic-player-page #player'
const SWIPE_SKIP = 'tp-yt-paper-slider, #progress-bar, button, a, .middle-controls-buttons, .right-controls, .volume-slider'

// untere navigationsleiste wie in der music app, nutzt die eintraege der seitenleiste
const NAV_ITEMS = [
  ['home', 'Startseite', 'M12 3 3 10.5V21h6v-6h6v6h6V10.5z'],
  ['explore', 'Entdecken', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.6 6.4-2 5.2-5.2 2 2-5.2z'],
  ['search', 'Suchen', 'M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z'],
  ['library', 'Mediathek', 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z']
]
const NAV_CSS = "#ytx-mnav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2100; display: flex; height: calc(56px + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px); box-sizing: border-box; background: color-mix(in srgb, var(--ytx-tint, #212121) 55%, #000); }\n#ytx-mnav[hidden] { display: none; }\n#ytx-mnav button { all: unset; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: var(--ytmusic-text-secondary, #aaa); font: 500 11px/1 Roboto, Arial, sans-serif; cursor: pointer; -webkit-tap-highlight-color: transparent; }\n#ytx-mnav button[aria-current] { color: var(--ytmusic-text-primary, #fff); }\n#ytx-mnav svg { width: 24px; height: 24px; fill: currentColor; }\nhtml[data-ytx-mnav] ytmusic-player-bar, html[data-ytx-mnav] #player-bar-background { position: fixed !important; left: 0 !important; right: 0 !important; bottom: calc(56px + env(safe-area-inset-bottom, 0px)) !important; top: auto !important; transform: none !important; }\nhtml[data-ytx-mnav] ytmusic-player#player { transform: translateY(-56px); }\nhtml[data-ytx-mnav] ytmusic-app-layout #content, html[data-ytx-mnav] ytmusic-browse-response, html[data-ytx-mnav] ytmusic-search-page { padding-bottom: 56px; }"

function navIcon(path) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  const p = document.createElementNS(ns, 'path')
  p.setAttribute('d', path)
  svg.append(p)
  return svg
}

function tapEl(el) {
  if (!el) return
  el.dispatchEvent(new CustomEvent('tap', { bubbles: true, composed: true, detail: { x: 0, y: 0 } }))
  el.click()
}

function openNavTarget(key) {
  if (key === 'search') {
    const sb = document.querySelector('ytmusic-nav-bar yt-icon-button.search-button')
    tapEl(sb?.querySelector('button') || sb)
    const box = document.querySelector('ytmusic-nav-bar ytmusic-search-box')
    try {
      if (box) box.opened = true
      if (box?.polymerController) box.polymerController.opened = true
    } catch {}
    setTimeout(() => document.querySelector('ytmusic-search-box input#input, ytmusic-search-box input')?.focus(), 250)
    return
  }
  const entries = () => Array.from(document.querySelectorAll(`ytmusic-guide-entry-renderer[data-ytx-mguide="${key}"]`))
  const pick = () => {
    const list = entries()
    const entry = list.find((e) => e.offsetParent !== null) || list[list.length - 1]
    const item = entry?.querySelector('tp-yt-paper-item') || entry
    if (!item) return
    item.dispatchEvent(new CustomEvent('tap', { bubbles: true, composed: true, detail: { x: 0, y: 0 } }))
    item.click()
  }
  if (entries().some((e) => e.offsetParent !== null)) return pick()
  const burger = document.querySelector('ytmusic-nav-bar #guide-button')
  ;(burger?.querySelector('button') || burger)?.click()
  setTimeout(pick, 450)
}

export const behaviors = [
  {
    id: 'm.bottomNav',
    label: 'Navigationsleiste unten (App)',
    description: 'Startseite, Entdecken, Suchen und Mediathek unten wie in der YouTube-Music-App',
    type: 'toggle',
    default: true,
    start() {
      if (!window.__ytxNative) return () => {}
      setCss('m.bottomNav', NAV_CSS)
      const buttons = NAV_ITEMS.map(([key, label, path]) => {
        const b = h('button', { type: 'button', 'data-key': key }, navIcon(path), label)
        b.addEventListener('click', (e) => {
          e.preventDefault()
          openNavTarget(key)
        })
        return b
      })
      const nav = h('nav', { id: 'ytx-mnav', 'data-ytx-own': '' }, ...buttons)
      document.documentElement.append(nav)
      const sync = () => {
        const layout = document.querySelector('ytmusic-app-layout')
        // nur bei leiste oder ohne wiedergabe zeigen, offener player und vollbild verdecken sie sonst
        const state = layout?.getAttribute('player-ui-state') || ''
        const full = !!state && state !== 'PLAYER_BAR_ONLY' && state !== 'INACTIVE'
        nav.hidden = !!full
        document.documentElement.toggleAttribute('data-ytx-mnav', !full)
        const page = document.documentElement.getAttribute('data-ytx-page')
        for (const b of buttons) b.toggleAttribute('aria-current', b.dataset.key === page)
      }
      sync()
      const t = setInterval(sync, 400)
      return () => {
        clearInterval(t)
        nav.remove()
        document.documentElement.removeAttribute('data-ytx-mnav')
        setCss('m.bottomNav', '')
      }
    }
  },
  {
    id: 'm.keepPlaying',
    label: 'Musik im Hintergrund weiterspielen (App)',
    description: 'In der ytx-App meldet die Seite nicht mehr, dass sie im Hintergrund ist. Sonst entlädt YouTube Music den Player beim Verlassen der App und die Wiedergabe stoppt',
    type: 'toggle',
    default: true,
    start() {
      if (!window.__ytxNative) return () => {}
      const d = document
      const redefine = (key, value) => {
        try {
          Object.defineProperty(d, key, { configurable: true, get: () => value })
        } catch {}
      }
      redefine('hidden', false)
      redefine('webkitHidden', false)
      redefine('visibilityState', 'visible')
      redefine('webkitVisibilityState', 'visible')
      const block = (e) => e.stopImmediatePropagation()
      d.addEventListener('visibilitychange', block, true)
      window.addEventListener('visibilitychange', block, true)
      return () => {
        d.removeEventListener('visibilitychange', block, true)
        window.removeEventListener('visibilitychange', block, true)
        for (const k of ['hidden', 'webkitHidden', 'visibilityState', 'webkitVisibilityState']) delete d[k]
      }
    }
  },
  {
    id: 'm.swipeSkip',
    label: 'Cover und Playerleiste wischen: nächster oder vorheriger Titel',
    description: 'Nach links wischen spielt den nächsten Titel, nach rechts den vorherigen, wie in der YouTube-Music-App',
    type: 'toggle',
    default: true,
    start() {
      let t0 = null
      const click = (sel) => document.querySelector(`ytmusic-player-bar ${sel}`)?.click()
      const offs = [
        listen(document, 'touchstart', (e) => {
          t0 = null
          if (e.touches.length !== 1 || !e.target.closest?.(SWIPE_ZONE) || e.target.closest?.(SWIPE_SKIP)) return
          t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now(), done: false }
        }, { passive: true, capture: true }),
        listen(document, 'touchmove', (e) => {
          if (!t0 || t0.done || e.touches.length !== 1) return
          const dx = e.touches[0].clientX - t0.x
          const dy = e.touches[0].clientY - t0.y
          if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) t0 = null
          else if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - t0.at < 1200) {
            t0.done = true
            click(dx < 0 ? '.next-button' : '.previous-button')
          }
        }, { passive: true, capture: true })
      ]
      return () => offs.forEach((off) => off())
    }
  },
  {
    id: 'm.stillThere',
    label: '„Noch da?“ automatisch bestätigen',
    description: 'Die Wiedergabe pausiert nicht mehr nach längerer Zeit ohne Eingabe',
    type: 'toggle',
    default: false,
    start(ctx) {
      let hits = 0
      const off = ctx.onSweep(() => {
        for (const r of qsa('ytmusic-you-there-renderer')) {
          const dialog = r.closest('tp-yt-paper-dialog') || r
          if (dialog.hidden || getComputedStyle(dialog).display === 'none') continue
          if (clickConfirm(r)) hits++
        }
      })
      ctx.state.set('m.stillThere.hits', 0)
      return () => {
        off()
        ctx.state.set('m.stillThere.hits', hits)
      }
    },
    health: () => ({ status: 'ok', detail: 'beobachtet Dialoge' })
  },
  {
    id: 'm.closePromoDialogs',
    label: 'Premium-Dialoge schließen',
    description: 'Schließt Upsell-Popups statt sie nur zu verstecken, damit die Seite bedienbar bleibt',
    type: 'toggle',
    default: false,
    start(ctx) {
      const off = ctx.onSweep(() => {
        for (const r of qsa('ytmusic-mealbar-promo-renderer, ytmusic-upsell-dialog-renderer')) {
          const dismiss = r.querySelector('#dismiss-button button, .dismiss-button button, yt-button-renderer.dismiss-button button')
          if (dismiss && r.offsetParent !== null) dismiss.click()
        }
      })
      return off
    }
  },
  {
    id: 'm.homeRedirect',
    label: 'Startseite umleiten',
    description: 'Beim Öffnen von music.youtube.com direkt woanders landen',
    type: 'select',
    options: [
      ['', 'Aus'],
      ['/library', 'Mediathek'],
      ['/explore', 'Entdecken'],
      ['/playlist?list=LM', 'Lieblingssongs'],
      ['/history', 'Verlauf']
    ],
    default: '',
    radical: true,
    start(ctx, target) {
      if (location.pathname === '/' && !location.search) location.replace(target)
      return () => {}
    }
  },
  audioFocus
]

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
