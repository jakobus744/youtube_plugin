import { behaviors as yt } from './youtube.js'
import { listen } from '../core/lifecycle.js'
import { pageFromUrl } from '../registry/youtube/pages.js'
import { audioFocus } from './appAudio.js'

// verhalten fuer m.youtube.com
// umleitungen arbeiten mit urls, der rest mit der player api, beides gibt es auch mobil

const SHARED = ['shortsRedirect', 'homeRedirect', 'autoplayOff', 'forceQuality', 'speedMemory', 'pauseOnBlur', 'channelTrailerPause']

// video nach unten wischen bringt zur vorherigen seite zurueck, wie das herunterziehen in der youtube app
const swipeDownBack = {
  id: 'swipeDownBack',
  label: 'Video nach unten wischen, um zu verkleinern',
  description: 'Wie in der YouTube-App: Das Video nach unten ziehen bringt dich zur vorherigen Seite zurück. In der ytx-App läuft das Video dabei klein unten rechts weiter, antippen holt es zurück. Nicht im Vollbild und nicht an der Zeitleiste',
  type: 'toggle',
  default: true,
  start() {
    let t0 = null
    const inPlayer = (el) => !!el?.closest?.('#movie_player, ytm-custom-control, #player-container-id, .player-container')
    const full = () => !!document.fullscreenElement || document.body?.getAttribute('faux-fullscreen') === 'true'
    const offs = [
      listen(document, 'touchstart', (e) => {
        t0 = null
        if (e.touches.length !== 1 || pageFromUrl(location.href) !== 'watch' || full() || !inPlayer(e.target)) return
        const box = (e.target.closest('#movie_player, ytm-custom-control') || e.target).getBoundingClientRect()
        const y = e.touches[0].clientY
        // untere kante gehoert der zeitleiste
        if (box.height && y > box.bottom - 40) return
        t0 = { x: e.touches[0].clientX, y, at: Date.now(), done: false }
      }, { passive: true, capture: true }),
      listen(document, 'touchmove', (e) => {
        if (!t0 || t0.done || e.touches.length !== 1) return
        const dx = e.touches[0].clientX - t0.x
        const dy = e.touches[0].clientY - t0.y
        if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) t0 = null
        else if (dy > 55 && dy > Math.abs(dx) * 1.1 && Date.now() - t0.at < 1500) {
          t0.done = true
          // in der app wird das video klein weitergespielt, sonst geht es nur zurueck
          if (window.__ytxNative) window.__ytxNative({ a: 'minimize' })
          else history.back()
        } else if (dy < -70 && -dy > Math.abs(dx) * 1.2 && Date.now() - t0.at < 1500) {
          // nach oben wischen: vollbild, wie in der youtube app
          t0.done = true
          document.querySelector('#movie_player')?.toggleFullscreen?.()
        }
      }, { passive: true, capture: true })
    ]
    return () => offs.forEach((off) => off())
  }
}

// kurz auf die zeitleiste tippen springt an die stelle, gedrueckt halten zeigt weiter die vorschau von youtube
const tapSeek = {
  id: 'tapSeek',
  label: 'Zeitleiste antippen springt zur Stelle',
  description: 'Ein kurzer Tipp auf die Zeitleiste springt im Video dorthin. Gedrückt halten und ziehen zeigt wie gewohnt die Vorschau',
  type: 'toggle',
  default: true,
  start() {
    let t0 = null
    // die breiteste leiste unter dem finger, die gespielte teilstrecke ist schmaler
    const barOf = (el) => {
      let best = null
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        if (e.id === 'movie_player') break
        const name = `${e.tagName} ${typeof e.className === 'string' ? e.className : ''}`
        if (/progress.?bar|scrubber|timebar|seek/i.test(name)) {
          const w = e.getBoundingClientRect().width
          if (!best || w > best.w) best = { el: e, w }
        }
      }
      return best && best.w > 60 ? best.el : null
    }
    const offs = [
      listen(document, 'touchstart', (e) => {
        t0 = null
        if (e.touches.length !== 1 || pageFromUrl(location.href) !== 'watch') return
        const bar = barOf(e.target)
        if (bar) t0 = { bar, x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() }
      }, { passive: true, capture: true }),
      listen(document, 'touchend', (e) => {
        const s = t0
        t0 = null
        const t = e.changedTouches[0]
        if (!s || !t || Date.now() - s.at > 600 || Math.abs(t.clientX - s.x) > 24 || Math.abs(t.clientY - s.y) > 24) return
        const r = s.bar.getBoundingClientRect()
        const frac = Math.min(1, Math.max(0, (s.x - r.left) / r.width))
        const p = document.getElementById('movie_player')
        const dur = p?.getDuration?.() || document.querySelector('#movie_player video')?.duration
        if (!dur) return
        // nach der eigenen behandlung von youtube, sonst setzt die vorschau die zeit zurueck
        const target = frac * dur
        const go = () => {
          if (p?.seekTo) p.seekTo(target, true)
          else document.querySelector('#movie_player video').currentTime = target
        }
        setTimeout(go, 80)
        // zieht youtube nach dem loslassen auf die alte stelle zurueck, noch einmal setzen
        setTimeout(() => {
          const now = p?.getCurrentTime?.()
          if (now != null && Math.abs(now - target) > 2) go()
        }, 500)
      }, { passive: true, capture: true })
    ]
    return () => offs.forEach((off) => off())
  }
}

// beim kippen des handys schaltet youtube auf eine seiteneigene vollbildansicht, die app blendet dazu die systemleisten aus
const appFullscreen = {
  id: 'appFullscreen',
  label: 'Echtes Vollbild beim Kippen (App)',
  description: 'In der ytx-App blendet das Vollbild von YouTube auch Status- und Navigationsleiste aus, wie in der YouTube-App',
  type: 'toggle',
  default: true,
  start() {
    if (!window.__ytxNative) return () => {}
    let last = false
    let wasLand = innerWidth > innerHeight
    let autoFor = ''
    let exitedFor = ''
    let wasFull = false
    // eigener knopf zum verlassen, weil die leiste von youtube im vollbild nicht immer reagiert
    let exitBtn = null
    let hideTimer = 0
    const leave = () => {
      const p = document.getElementById('movie_player')
      exitedFor = autoFor = new URLSearchParams(location.search).get('v') || ''
      // derselbe weg wie beim hochkant kippen
      p?.toggleFullscreen?.()
      exitBtn?.classList.remove('show')
      verifyExit()
    }
    // hat es nicht geklappt, den browser selbst aus dem vollbild holen und die seite nach oben setzen
    const verifyExit = () => {
      setTimeout(() => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {})
        scrollTo(0, 0)
      }, 800)
    }
    const showBtn = () => {
      if (!isFull()) return
      if (!exitBtn) {
        exitBtn = document.createElement('button')
        exitBtn.type = 'button'
        exitBtn.id = 'ytx-fs-exit'
        exitBtn.setAttribute('data-ytx-own', '')
        exitBtn.setAttribute('aria-label', 'Vollbild verlassen')
        exitBtn.textContent = '⤡'
        exitBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          leave()
        })
      }
      // im echten vollbild liegt nur das vollbildelement vorne, der knopf muss darin stehen
      const host = document.fullscreenElement || document.body || document.documentElement
      if (exitBtn.parentElement !== host) host.append(exitBtn)
      exitBtn.classList.add('show')
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => exitBtn?.classList.remove('show'), 3500)
    }
    const offTouch = listen(document, 'touchstart', showBtn, { passive: true, capture: true })
    // das vollbild symbol von youtube selbst soll ebenfalls zuverlaessig beenden
    const offClick = listen(document, 'click', (e) => {
      // das vollbild symbol von youtube macht genau das gleiche wie das hochkant kippen
      if (isFull() && e.target?.closest?.('.fullscreen-icon')) {
        e.stopPropagation()
        e.preventDefault()
        leave()
      }
    }, { capture: true })
    // nach dem beenden darf youtube das video nicht von selbst (z. b. beim scrollen im querformat) wieder ins vollbild holen
    // erlaubt ist nur ein echter klick auf den knopf oder unser eigener aufruf
    const origRequest = Element.prototype.requestFullscreen
    let allowEnter = false
    if (origRequest) {
      Element.prototype.requestFullscreen = function (...a) {
        const vid = new URLSearchParams(location.search).get('v') || ''
        const click = window.event && window.event.type === 'click'
        if (!allowEnter && !click && exitedFor && exitedFor === vid) return Promise.reject(new Error('ytx: vollbild nach dem Beenden gesperrt'))
        return origRequest.apply(this, a)
      }
    }
    // das vollbildelement der youtube leiste ist der container um player und bedienung, nicht der player allein
    const enterFs = (p) => {
      const box = document.getElementById('player-container-id')
      allowEnter = true
      setTimeout(() => (allowEnter = false), 600)
      if (box?.requestFullscreen) box.requestFullscreen().catch(() => p.toggleFullscreen?.())
      else p.toggleFullscreen?.()
    }
    const isFull = () => !!document.fullscreenElement || document.body?.getAttribute('faux-fullscreen') === 'true'
    const t = setInterval(() => {
      const land = innerWidth > innerHeight
      const p = document.getElementById('movie_player')
      const watching = pageFromUrl(location.href) === 'watch' && p
      // wie in der youtube app: quer gehalten ist das video im vollbild, hochkant wieder normal
      // auch ein video das erst im querformat geladen wird geht ins vollbild, einmal pro video
      // nur die video id zaehlt, die adresse aendert sich beim abspielen sonst weiter
      const vid = watching ? new URLSearchParams(location.search).get('v') || '' : ''
      if (land !== wasLand && watching) {
        wasLand = land
        if (land && !isFull()) enterFs(p)
        if (!land && isFull()) p.toggleFullscreen?.()
        autoFor = land ? vid : ''
        exitedFor = ''
      } else if (land && watching && vid && vid !== autoFor && vid !== exitedFor && p.getPlayerState?.() === 1 && !isFull()) {
        autoFor = vid
        enterFs(p)
      } else wasLand = land
      // selbst beendet: fuer dieses video nicht wieder automatisch hinein
      if (wasFull && !isFull() && land) exitedFor = autoFor = vid
      wasFull = isFull()
      const on = isFull() && land
      document.documentElement.toggleAttribute('data-ytx-fs', on)
      if (on === last) return
      last = on
      window.__ytxNative({ a: on ? 'fsOn' : 'fsOff' })
    }, 250)
    return () => {
      clearInterval(t)
      offTouch()
      offClick()
      if (origRequest) Element.prototype.requestFullscreen = origRequest
      exitBtn?.remove()
      if (last) window.__ytxNative({ a: 'fsOff' })
    }
  }
}

export const behaviors = [...yt.filter((b) => SHARED.includes(b.id)), swipeDownBack, tapSeek, appFullscreen, audioFocus]

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
