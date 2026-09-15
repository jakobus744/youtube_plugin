import { listen } from '../core/lifecycle.js'
import { qs } from '../core/dom.js'
import { player, pageWindow } from '../core/bridge.js'
import { log } from '../core/log.js'
import { sleep, waitFor } from '../core/scheduler.js'

// verhalten sind aktionen statt css
// start(ctx, value) liefert eine stop funktion

const QUALITY_ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny']

function shortsId(url) {
  const m = String(url || '').match(/\/shorts\/([\w-]{6,})/)
  return m ? m[1] : null
}

export const behaviors = [
  {
    id: 'shortsRedirect',
    label: 'Shorts als normales Video öffnen',
    description: '/shorts/ID wird zu /watch?v=ID umgeleitet',
    type: 'toggle',
    default: false,
    early: true,
    start(ctx) {
      const go = (url) => {
        const id = shortsId(url)
        if (id) location.replace(`/watch?v=${id}`)
      }
      go(location.href)
      const a = ctx.nav.on('start', (page, url) => page === 'shorts' && go(url))
      const b = ctx.nav.on('page', (page) => page === 'shorts' && go(location.href))
      return () => {
        a()
        b()
      }
    },
    health: (ctx) => ({ status: ctx.nav.eventsSeen.has('yt-navigate-start') || ctx.nav.page !== 'other' ? 'ok' : 'warn', detail: ctx.nav.eventsSeen.has('yt-navigate-start') ? 'Navigations-Events kommen an' : 'Noch kein Navigations-Event gesehen – Umleitung greift beim Laden trotzdem' })
  },
  {
    id: 'homeRedirect',
    label: 'Startseite umleiten',
    description: 'Die Startseite wird beim Öffnen sofort ersetzt',
    type: 'select',
    options: [
      ['', 'Aus'],
      ['/feed/subscriptions', 'Abos'],
      ['/feed/history', 'Verlauf'],
      ['/playlist?list=WL', 'Später ansehen'],
      ['/feed/playlists', 'Playlists']
    ],
    default: '',
    radical: true,
    early: true,
    start(ctx, target) {
      const go = () => {
        if (location.pathname === '/') location.replace(target)
      }
      go()
      const a = ctx.nav.on('start', (page) => page === 'home' && location.replace(target))
      const b = ctx.nav.on('page', (page) => page === 'home' && go())
      return () => {
        a()
        b()
      }
    }
  },
  {
    id: 'autoplayOff',
    label: 'Autoplay ausschalten',
    description: 'Schaltet den Autoplay-Schalter im Player einmal pro Video aus. Wer ihn danach selbst anmacht, wird nicht überstimmt',
    type: 'toggle',
    default: false,
    start(ctx) {
      // youtube setzt den schalter nach dem laden teils selbst zurueck
      // daher wird der zustand sichergestellt bis der nutzer selbst klickt
      let userTouched = false
      let lastTry = 0
      let clicks = 0
      const offUser = listen(
        document,
        'click',
        (e) => {
          if (e.isTrusted && e.target?.closest?.('#movie_player .ytp-autonav-toggle')) userTouched = true
        },
        true
      )
      const offVideo = ctx.nav.on('video', () => (clicks = 0))
      const check = () => {
        if (ctx.nav.page !== 'watch' || userTouched || clicks >= 10) return
        const now = Date.now()
        if (now - lastTry < 1200 || !player()?.getPlayerState) return
        const toggle = qs('#movie_player .ytp-autonav-toggle-button')
        if (!toggle || toggle.getAttribute('aria-checked') !== 'true') return
        const btn = toggle.closest('button') || toggle
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        lastTry = now
        clicks++
        log.info(`autoplay ausgeschaltet (${clicks})`)
      }
      const off = ctx.onSweep(check)
      const iv = setInterval(check, 1500)
      check()
      return () => {
        off()
        offUser()
        offVideo()
        clearInterval(iv)
      }
    },
    health: () => {
      if (!document.querySelector('#movie_player')) return { status: 'skip', detail: 'Kein Player auf dieser Seite' }
      const btn = qs('#movie_player .ytp-autonav-toggle-button')
      return btn ? { status: 'ok', detail: `Schalter gefunden (an: ${btn.getAttribute('aria-checked')})` } : { status: 'warn', detail: 'Autoplay-Schalter nicht gefunden' }
    }
  },
  {
    id: 'forceQuality',
    label: 'Bevorzugte Qualität',
    description: 'Setzt beim Start jedes Videos die Qualität, oder die nächst niedrigere verfügbare',
    type: 'select',
    options: [['', 'YouTube entscheidet'], ['hd2160', '2160p'], ['hd1440', '1440p'], ['hd1080', '1080p'], ['hd720', '720p'], ['large', '480p'], ['medium', '360p']],
    default: '',
    start(ctx, quality) {
      let applied = null
      const apply = async () => {
        if (ctx.nav.page !== 'watch' || !ctx.nav.videoId || applied === ctx.nav.videoId) return
        const vid = ctx.nav.videoId
        const levels = await waitFor(() => {
          const l = player()?.getAvailableQualityLevels?.()
          return l && l.length ? l : null
        }, { timeout: 8000, interval: 250 })
        if (!levels || vid !== ctx.nav.videoId) return
        const want = QUALITY_ORDER.indexOf(quality)
        const pick = levels.filter((l) => l !== 'auto').find((l) => QUALITY_ORDER.indexOf(l) >= want) || levels[0]
        const p = player()
        try {
          p.setPlaybackQualityRange?.(pick, pick)
          p.setPlaybackQuality?.(pick)
          applied = vid
          log.info(`qualitaet ${pick}`)
        } catch (e) {
          log.warn('qualitaet setzen', e)
        }
      }
      const off = ctx.nav.on('video', () => {
        applied = null
        apply()
      })
      const off2 = listen(document, 'playing', (e) => e.target?.closest?.('#movie_player') && apply(), true)
      apply()
      return () => {
        off()
        off2()
      }
    },
    health: () => {
      const p = player()
      if (!p) return { status: 'skip', detail: 'Kein Player' }
      return typeof p.setPlaybackQualityRange === 'function' ? { status: 'ok', detail: `Aktuell ${p.getPlaybackQuality?.()}` } : { status: 'fail', detail: 'Player-API setPlaybackQualityRange fehlt' }
    }
  },
  {
    id: 'speedMemory',
    label: 'Geschwindigkeit merken',
    description: 'Neue Videos starten mit der zuletzt gewählten Geschwindigkeit',
    type: 'toggle',
    default: false,
    start(ctx) {
      let saved = Number(ctx.state.get('speed', 1)) || 1
      let setting = false
      const inMainPlayer = (v) => v?.tagName === 'VIDEO' && v.closest('#movie_player')
      const adShowing = () => !!qs('#movie_player.ad-showing')
      const a = listen(
        document,
        'ratechange',
        (e) => {
          if (setting || !inMainPlayer(e.target) || adShowing()) return
          saved = e.target.playbackRate
          ctx.state.set('speed', saved)
        },
        true
      )
      const b = listen(
        document,
        'playing',
        (e) => {
          const v = e.target
          if (!inMainPlayer(v) || adShowing() || Math.abs(v.playbackRate - saved) < 0.01) return
          setting = true
          try {
            const p = player()
            if (p?.setPlaybackRate) p.setPlaybackRate(saved)
            else v.playbackRate = saved
          } finally {
            setTimeout(() => (setting = false), 100)
          }
        },
        true
      )
      return () => {
        a()
        b()
      }
    }
  },
  {
    id: 'pauseOnBlur',
    label: 'Pausieren wenn Tab im Hintergrund',
    type: 'select',
    options: [['', 'Aus'], ['pause', 'Nur pausieren'], ['resume', 'Pausieren und beim Zurückkommen fortsetzen']],
    default: '',
    start(ctx, mode) {
      let pausedByUs = false
      return listen(document, 'visibilitychange', () => {
        const p = player()
        if (!p || ctx.nav.page !== 'watch') return
        if (document.hidden) {
          if (p.getPlayerState?.() === 1) {
            p.pauseVideo()
            pausedByUs = true
          }
        } else if (mode === 'resume' && pausedByUs) {
          p.playVideo()
          pausedByUs = false
        }
      })
    }
  },
  {
    id: 'channelTrailerPause',
    label: 'Kanal-Trailer nicht automatisch abspielen',
    type: 'toggle',
    default: false,
    start() {
      return listen(
        document,
        'playing',
        (e) => {
          const v = e.target
          if (v?.tagName === 'VIDEO' && v.closest('ytd-channel-video-player-renderer')) v.pause()
        },
        true
      )
    }
  },
  {
    id: 'experimentalFlags',
    label: 'Experiment-Flags (experimentell)',
    description: 'Eine Zeile pro Flag: name=wert. Wirkt erst nach Neuladen und oft gar nicht, YouTube kann Flags jederzeit ignorieren',
    type: 'textarea',
    default: '',
    radical: true,
    early: true,
    start(ctx, text) {
      const flags = parseFlags(text)
      if (!Object.keys(flags).length) return () => {}
      let stopped = false
      ;(async () => {
        for (let i = 0; i < 200 && !stopped; i++) {
          const cfg = pageWindow.ytcfg
          if (cfg?.set && cfg?.get) {
            try {
              cfg.set({ EXPERIMENT_FLAGS: { ...(cfg.get('EXPERIMENT_FLAGS') || {}), ...flags } })
              log.info(`flags gesetzt ${Object.keys(flags).length}`)
            } catch (e) {
              log.warn('flags', e)
            }
            return
          }
          await sleep(25)
        }
      })()
      return () => (stopped = true)
    },
    health: (ctx, text) => {
      const flags = parseFlags(text)
      const keys = Object.keys(flags)
      if (!keys.length) return { status: 'skip', detail: 'Keine Flags gesetzt' }
      const cur = pageWindow.ytcfg?.get?.('EXPERIMENT_FLAGS') || {}
      const ok = keys.filter((k) => String(cur[k]) === String(flags[k]))
      return { status: ok.length === keys.length ? 'ok' : 'warn', detail: `${ok.length}/${keys.length} Flags im ytcfg wirksam` }
    }
  }
]

function parseFlags(text) {
  const out = {}
  for (const line of String(text || '').split('\n')) {
    const m = line.trim().match(/^([\w.]+)\s*=\s*(.+)$/)
    if (!m) continue
    const v = m[2].trim()
    out[m[1]] = v === 'true' ? true : v === 'false' ? false : isFinite(Number(v)) ? Number(v) : v
  }
  return out
}

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
