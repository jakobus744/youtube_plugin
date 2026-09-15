import { qsa } from '../core/dom.js'

// verhalten fuer music
// start(ctx, value) liefert eine stop funktion

function clickConfirm(dialog) {
  const btn = dialog.querySelector('yt-button-renderer#confirm-button button, #confirm-button button, yt-button-renderer button, button')
  if (!btn) return false
  btn.click()
  return true
}

export const behaviors = [
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
  }
]

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
