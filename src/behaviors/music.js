import { qsa } from '../core/dom.js'
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

export const behaviors = [
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
