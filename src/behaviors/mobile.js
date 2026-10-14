import { behaviors as yt } from './youtube.js'
import { listen } from '../core/lifecycle.js'
import { pageFromUrl } from '../registry/youtube/pages.js'
import { audioFocus } from './appAudio.js'
import { discovered, normColor, DARK_REFS, LIGHT_REFS } from '../appliers/hashTokens.js'
import { log } from '../core/log.js'
import { relatedDates } from './relatedDates.js'
import { playlistRemove } from './playlistRemove.js'

// verhalten fuer m.youtube.com
// umleitungen arbeiten mit urls, der rest mit der player api, beides gibt es auch mobil

const SHARED = ['shortsRedirect', 'homeRedirect', 'autoplayOff', 'forceQuality', 'speedMemory', 'pauseOnBlur', 'channelTrailerPause', 'shareClean', 'dislikeCount', 'likeCount']

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

// vorschau auf thumbnails wie in der youtube app: stumm, direkt im bild, mit untertiteln, ziehen spult
// gedrueckt halten startet sie, nach 1,5 Sekunden laeuft sie auch weiter wenn der finger weg ist
// oder ein video liegt in ruhe mitten im bild, dann startet sie von selbst
// der offizielle einbett player sitzt im thumbnail selbst, er scrollt mit der karte und liegt unter kopfzeile, suche und ytx fenster
const EMBED = 'https://www.youtube.com'
const HOLD_KEEP_MS = 1500
// kuerzer gedrueckt ist ein normaler tipp, der das video oeffnet
const TAP_MS = 350
const thumbPreview = {
  id: 'thumbPreview',
  label: 'Video-Vorschau auf Thumbnails',
  description: 'Stumme Vorschau mit Untertiteln direkt im Bild, wie in der YouTube-App. Gedrückt halten startet sie, nach 1,5 Sekunden läuft sie auch ohne Finger weiter. Nach links oder rechts ziehen spult. „Beim Verweilen“ startet sie von selbst, wenn ein Video in Ruhe mitten im Bild liegt. Ein kurzer Tipp öffnet das Video wie immer',
  type: 'select',
  options: [['', 'Aus'], ['press', 'Gedrückt halten'], ['both', 'Gedrückt halten und beim Verweilen']],
  default: 'both',
  start(ctx, mode) {
    const auto = mode === 'both'
    let timer = 0
    let press = null
    let drag = null
    let suppressUntil = 0
    let scrollAt = Date.now()
    let checkedAt = 0
    let dwell = { link: null, since: 0 }
    let live = null
    const idOf = (a) => (a?.getAttribute('href') || '').match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] || ''
    const thumbLink = (el) => {
      const a = el?.closest?.('a[href*="/watch?v="]')
      if (!a || !a.querySelector('img')) return null
      const r = a.getBoundingClientRect()
      return r.width > 80 && r.height > 40 ? a : null
    }
    // der bereich des bildes in der karte, dort hinein kommt der player
    const holderOf = (a) => {
      const img = a.querySelector('img')
      let el = img?.parentElement
      while (el && el !== a && el.getBoundingClientRect().height < 40) el = el.parentElement
      return el || a
    }
    const cmd = (func, ...args) => {
      try { live?.frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), EMBED) } catch {}
    }
    const stopLive = () => {
      clearTimeout(timer)
      if (live) {
        clearTimeout(live.hello)
        clearInterval(live.slideTimer)
        live.box.remove()
        live = null
      }
      press = null
      drag = null
    }
    const reveal = () => {
      if (!live) return
      if (live.vidOk && live.state === 1 && live.dur > 0 && live.cur > 0.15) live.shown = true
      live.frame.style.opacity = live.shown ? '1' : '0'
      if (live.shown && live.slideTimer) {
        clearInterval(live.slideTimer)
        live.slideTimer = 0
        live.slide.style.opacity = '0'
      }
    }
    const begin = (link, how) => {
      const id = idOf(link)
      if (!id) return
      const t0 = press ? press.t0 : Date.now()
      stopLive()
      const holder = holderOf(link)
      // eigener stapel, damit die vorschau in der karte bleibt und nie ueber kopfzeile oder fenster liegt
      if (getComputedStyle(holder).position === 'static') holder.style.position = 'relative'
      holder.style.isolation = 'isolate'
      const box = document.createElement('div')
      box.setAttribute('data-ytx-own', '')
      box.className = 'ytx-preview'
      box.style.cssText = 'position:absolute;inset:0;z-index:1;overflow:hidden;border-radius:inherit;pointer-events:none;background:transparent'
      // drei standbilder des videos laufen sofort, bis der player spielt
      const slide = document.createElement('img')
      slide.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1'
      slide.src = `https://i.ytimg.com/vi/${id}/hq1.jpg`
      const frame = document.createElement('iframe')
      frame.setAttribute('allow', 'autoplay; encrypted-media')
      // unten verankert vergroessert: die titelzeile oben faellt weg, die untertitel unten bleiben sichtbar
      frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;transform:scale(1.25);transform-origin:50% 100%;opacity:0;transition:opacity .12s'
      frame.src = `${EMBED}/embed/${id}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&fs=0&start=0&vq=small&iv_load_policy=3&cc_load_policy=1&cc_lang_pref=de&hl=de&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
      const track = document.createElement('div')
      track.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.3)'
      const bar = document.createElement('div')
      bar.style.cssText = 'height:100%;width:0;background:#ff0033'
      track.append(bar)
      box.append(slide, frame, track)
      holder.append(box)
      let n = 1
      live = { link, id, how, t0, box, frame, bar, slide, dur: 0, state: -1, cur: 0, vidOk: false, shown: false, target: -1, lastSeek: 0, seeking: false, loadedAt: Date.now() }
      live.slideTimer = setInterval(() => {
        n = (n % 3) + 1
        slide.src = `https://i.ytimg.com/vi/${id}/hq${n}.jpg`
      }, 700)
      const me = live
      const hello = () => {
        if (live !== me) return
        try { frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'ytx', channel: 'widget' }), EMBED) } catch {}
        me.hello = setTimeout(hello, me.ready ? 3000 : 250)
      }
      frame.addEventListener('load', hello, { once: true })
    }
    const onMsg = (e) => {
      if (!live || e.source !== live.frame.contentWindow) return
      let d
      try { d = JSON.parse(e.data) } catch { return }
      if (!live.ready) {
        live.ready = true
        cmd('mute')
        cmd('playVideo')
      }
      if (d.event === 'onError') return stopLive()
      const state = d.event === 'onStateChange' ? d.info : d.info?.playerState
      if (typeof state === 'number') {
        live.state = state
        // am ende von vorn, die vorschau laeuft so lange das video im bild liegt
        if (state === 0 && !live.seeking) {
          cmd('seekTo', 0, true)
          cmd('playVideo')
        }
      }
      const info = d.info
      const vid = info?.videoData?.video_id
      if (vid) live.vidOk = vid === live.id
      else if (!live.vidOk && live.state === 1 && Date.now() - live.loadedAt > 2500) live.vidOk = true
      if (!live.dur && info?.duration > 0) live.dur = info.duration
      const cur = info?.currentTime
      if (typeof cur === 'number') live.cur = cur
      if (!live.seeking && live.dur && cur >= 0) live.bar.style.width = `${Math.min(100, (cur / live.dur) * 100)}%`
      reveal()
    }
    window.addEventListener('message', onMsg)
    const seekTo = (x) => {
      if (!live || !live.dur) return
      live.seeking = true
      const r = live.box.getBoundingClientRect()
      const f = Math.min(1, Math.max(0, (x - r.left) / r.width))
      live.bar.style.width = `${f * 100}%`
      live.target = f * live.dur
      const now = Date.now()
      if (now - live.lastSeek < 300) return
      live.lastSeek = now
      cmd('seekTo', live.target, true)
    }
    const settleSeek = () => {
      if (!live) return
      if (live.target >= 0) {
        cmd('seekTo', live.target, true)
        cmd('playVideo')
        live.target = -1
      }
      live.seeking = false
      reveal()
    }
    // ein video in ruhe: mitten im bild, die seite scrollt nicht mehr
    const pickDwell = () => {
      const vh = innerHeight
      let best = null
      for (const a of document.querySelectorAll('a[href*="/watch?v="]')) {
        const r = a.getBoundingClientRect()
        if (r.width < 150 || r.height < 80 || r.top < vh * 0.12 || r.bottom > vh * 0.92) continue
        const d = Math.abs(r.top + r.height / 2 - vh * 0.45)
        if (d < vh * 0.22 && thumbLink(a) && (!best || d < best.d)) best = { a, d }
      }
      return best?.a || null
    }
    // die vorschau endet, wenn ihr video die bildmitte verlaesst oder ein fenster daruebergeht
    const overlayOpen = () => !!document.querySelector('ytm-search[open], .ytm-search-suggestions, bottom-sheet-container:not([hidden]) .ytSpecBottomSheetLayoutHost, ytm-menu-popup-renderer, .ytx-panel-open, html[data-ytx-panel]')
    const poll = setInterval(() => {
      if (document.hidden || document.fullscreenElement || press || drag) return
      if (pageFromUrl(location.href) === 'watch' || navigator.connection?.saveData) return live && stopLive()
      if (live) {
        const r = live.link.getBoundingClientRect()
        const mid = r.top + r.height / 2
        if (!live.link.isConnected || mid < innerHeight * 0.1 || mid > innerHeight * 0.92 || overlayOpen()) return stopLive()
      }
      const now = Date.now()
      if (!auto || now - scrollAt < 300 || overlayOpen()) return
      if (checkedAt < scrollAt) {
        checkedAt = now
        dwell = { link: pickDwell(), since: now }
        return
      }
      const c = dwell.link
      if (c && (!live || (live.how === 'auto' && live.link !== c)) && now - dwell.since > 120) begin(c, 'auto')
    }, 200)
    const onScroll = (e) => {
      const t = e.target
      if (t !== document && t !== document.documentElement && t !== document.body) return
      scrollAt = Date.now()
    }
    const inLive = (t) => {
      if (!live) return false
      const r = live.box.getBoundingClientRect()
      return t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom
    }
    const offs = [
      listen(window, 'scroll', onScroll, { passive: true, capture: true }),
      listen(document, 'touchstart', (e) => {
        if (e.touches.length !== 1) return stopLive()
        const t = e.touches[0]
        if (live && live.how === 'auto' && inLive(t)) {
          drag = { x: t.clientX, y: t.clientY, moved: false, t0: Date.now() }
          return
        }
        press = null
        drag = null
        clearTimeout(timer)
        if (!(live && live.how === 'auto')) stopLive()
        const link = thumbLink(e.target)
        if (!link) return
        press = { x: t.clientX, y: t.clientY, link, t0: Date.now() }
        // erst nach dem kurzen tipp beginnen, ein tipp oeffnet das video
        timer = setTimeout(() => {
          if (press) begin(press.link, 'press')
        }, TAP_MS)
      }, { passive: true, capture: true }),
      listen(document, 'touchmove', (e) => {
        const t = e.touches[0]
        if (live && live.how === 'press') {
          e.preventDefault()
          if (Math.abs(t.clientX - (press?.x ?? t.clientX)) > 8) live.moved = true
          seekTo(t.clientX)
        } else if (live && drag) {
          const dx = t.clientX - drag.x
          const dy = t.clientY - drag.y
          if (!drag.moved && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
            drag = null
          } else if (drag.moved || (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.2)) {
            drag.moved = true
            e.preventDefault()
            seekTo(t.clientX)
          }
        } else if (press && (Math.abs(t.clientX - press.x) > 12 || Math.abs(t.clientY - press.y) > 12)) {
          clearTimeout(timer)
          press = null
        }
      }, { passive: false, capture: true }),
      listen(document, 'touchend', () => {
        clearTimeout(timer)
        if (live && live.how === 'press') {
          const held = Date.now() - live.t0
          settleSeek()
          // nach 1,5 sekunden halten laeuft die vorschau weiter, auch ohne finger
          if (held >= HOLD_KEEP_MS) live.how = 'auto'
          else stopLive()
          suppressUntil = Date.now() + 500
        } else if (drag?.moved) {
          settleSeek()
          suppressUntil = Date.now() + 500
        }
        press = null
        drag = null
      }, { passive: true, capture: true }),
      listen(document, 'touchcancel', () => {
        press = null
        drag = null
        if (live && live.how === 'press') stopLive()
      }, { passive: true, capture: true }),
      listen(document, 'contextmenu', (e) => {
        if (live || press) e.preventDefault()
      }, { capture: true }),
      // der klick nach dem spulen oder halten soll das video nicht oeffnen, ein normaler tipp oeffnet es wie immer
      listen(document, 'click', (e) => {
        if (Date.now() < suppressUntil) {
          e.stopPropagation()
          e.preventDefault()
        } else if (live) stopLive()
      }, { capture: true })
    ]
    return () => {
      clearInterval(poll)
      window.removeEventListener('message', onMsg)
      offs.forEach((off) => off())
      stopLive()
    }
  }
}

// auf der Startseite oben angekommen nach unten ziehen laedt neue Videos, wie in der YouTube App
const pullRefresh = {
  id: 'pullRefresh',
  label: 'Startseite durch Herunterziehen neu laden',
  description: 'Ist die Startseite ganz oben, laedt Herunterziehen und Loslassen neue Videos, wie in der YouTube-App',
  type: 'toggle',
  default: true,
  start() {
    // der Hilfsparameter der Neu-Laden-Geste soll nicht in der Adresse stehen bleiben
    if (new URLSearchParams(location.search).has('ytxr')) {
      const u = new URL(location.href)
      u.searchParams.delete('ytxr')
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash)
    }
    const TRIGGER = 130
    let t0 = null
    let dot = null
    const atTop = () => (document.scrollingElement?.scrollTop || window.scrollY || 0) <= 1
    const mk = () => {
      if (dot) return dot
      dot = document.createElement('div')
      dot.setAttribute('data-ytx-own', '')
      dot.style.cssText = 'position:fixed;left:50%;top:70px;z-index:2147483000;width:40px;height:40px;margin-left:-20px;border-radius:50%;background:var(--yt-spec-raised-background,#2a2a2a);box-shadow:0 2px 10px rgba(0,0,0,.5);color:var(--yt-spec-text-primary,#fff);font:700 22px/40px sans-serif;text-align:center;opacity:0;pointer-events:none;transform:translateY(-40px)'
      dot.textContent = '↻'
      document.documentElement.append(dot)
      return dot
    }
    const hide = () => {
      if (!dot) return
      dot.style.transition = 'opacity .15s, transform .15s'
      dot.style.opacity = '0'
      dot.style.transform = 'translateY(-40px)'
    }
    const offs = [
      listen(document, 'touchstart', (e) => {
        t0 = null
        if (e.touches.length !== 1 || pageFromUrl(location.href) !== 'home' || !atTop()) return
        // nicht aus Menues, Leisten oder Karussells heraus
        if (e.target.closest?.('ytm-mobile-topbar-renderer, ytm-pivot-bar-renderer, bottom-sheet-container, ytm-chip-cloud-renderer, [role="dialog"]')) return
        t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false }
      }, { passive: true, capture: true }),
      listen(document, 'touchmove', (e) => {
        if (!t0) return
        const dy = e.touches[0].clientY - t0.y
        const dx = e.touches[0].clientX - t0.x
        if (!atTop() || dy < 0 || Math.abs(dx) > dy) {
          t0 = null
          hide()
          return
        }
        if (dy > 20) {
          t0.active = true
          const d = mk()
          d.style.transition = 'none'
          const k = Math.min(1, dy / TRIGGER)
          d.style.opacity = String(k)
          d.style.transform = `translateY(${-40 + k * 60}px) rotate(${k * 270}deg)`
        }
      }, { passive: true, capture: true }),
      listen(document, 'touchend', () => {
        const s = t0
        t0 = null
        if (!s?.active) return hide()
        const d = mk()
        const done = parseFloat(d.style.opacity) >= 1
        if (!done) return hide()
        d.style.transition = 'transform 1s linear'
        d.style.transform = 'translateY(20px) rotate(1080deg)'
        // eine frische Adresse umgeht den Zwischenspeicher, ein einfaches reload kann dieselben Videos zeigen
        const u = new URL(location.href)
        u.searchParams.set('ytxr', String(Date.now()))
        location.replace(u.href)
      }, { passive: true, capture: true })
    ]
    return () => {
      offs.forEach((off) => off())
      dot?.remove()
    }
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
    let wasLand = innerWidth > innerHeight && innerHeight >= 250
    let autoFor = ''
    let exitedFor = ''
    let wasFull = false
    // Wachhund fuer die Videoseite: im Hochformat bleibt der Player oben stehen, nach dem Vollbild kann YouTube das vergessen
    let badTicks = 0
    let heals = 0
    let lastWatchVid = ''
    const playerBox = () => document.getElementById('player-container-id') || document.getElementById('movie_player')
    const playerGone = () => {
      const box = playerBox()
      if (!box) return false
      const scrolled = scrollY > 0 || (document.scrollingElement?.scrollTop || 0) > 0
      return scrolled && box.getBoundingClientRect().bottom < innerHeight * 0.1
    }
    // festgesetzt per Attribut und Stylesheet, YouTube ueberschreibt Inline Werte am Player nach kurzer Zeit wieder
    let pinned = null
    const pinPlayer = () => {
      const box = playerBox()
      if (!box) return
      if (pinned !== box) {
        const top = Math.round(box.getBoundingClientRect().top + scrollY)
        document.documentElement.style.setProperty('--ytx-pin-top', top + 'px')
      }
      box.setAttribute('data-ytx-pin', '')
      document.documentElement.toggleAttribute('data-ytx-pinned', true)
      pinned = box
    }
    const unpinPlayer = () => {
      pinned?.removeAttribute('data-ytx-pin')
      document.documentElement.removeAttribute('data-ytx-pinned')
      pinned = null
    }
    const healLayout = () => {
      heals++
      if (heals > 6) return pinPlayer()
      const box = playerBox()
      const info = []
      for (let e = box, i = 0; e && i < 4; e = e.parentElement, i++) {
        const cs = getComputedStyle(e)
        const r = e.getBoundingClientRect()
        info.push(`${e.localName}#${e.id || ''} pos=${cs.position} top=${Math.round(r.top)} h=${Math.round(r.height)}`)
      }
      log.warn(`Videoseite: Player nicht mehr oben (${innerWidth}x${innerHeight}, scrollY ${Math.round(scrollY)}) ${info.join(' < ')}`)
      // der Log zeigt: der Player steht dann auf position absolute und scrollt mit der Seite, normal bleibt er oben stehen
      // also wieder oben festsetzen, an der Stelle, an der er ohne Scrollen steht (die Seite hat dafuer schon Platz gelassen)
      pinPlayer()
    }
    // ohne frische beruehrung verweigert Gecko das echte Vollbild, dann fuellt der player selbst die ganze Seite
    let faux = false
    const setFaux = (on) => {
      if (faux === on) return
      faux = on
      document.documentElement.toggleAttribute('data-ytx-faux', on)
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    }
    const leave = () => {
      const p = document.getElementById('movie_player')
      exitedFor = autoFor = new URLSearchParams(location.search).get('v') || ''
      // derselbe weg wie beim hochkant kippen
      if (faux) setFaux(false)
      else p?.toggleFullscreen?.()
      verifyExit()
    }
    // hat es nicht geklappt, den browser selbst aus dem vollbild holen und die seite nach oben setzen
    const verifyExit = () => {
      setTimeout(() => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {})
        scrollTo(0, 0)
      }, 800)
    }
    // Bild fuellen: das Video wird so vergroessert, dass es den ganzen Bildschirm nutzt, die Raender werden beschnitten
    let fillBtn = null
    let fillOn = false
    const fillScale = () => {
      const v = document.querySelector('#movie_player video')
      if (!v || !v.videoWidth || !v.videoHeight) return
      const a = v.videoWidth / v.videoHeight
      const b = innerWidth / innerHeight
      v.style.setProperty('scale', String(Math.max(a / b, b / a)), 'important')
    }
    const setFill = (on) => {
      fillOn = on
      document.documentElement.toggleAttribute('data-ytx-fill', on)
      fillBtn?.classList.toggle('on', on)
      if (on) fillScale()
      else document.querySelector('#movie_player video')?.style.removeProperty('scale')
    }
    const ensureBtn = () => {
      // die Leiste von YouTube hat unten rechts den Vollbild Knopf, der Knopf steht daneben und blendet mit ein und aus
      const host = document.querySelector('.player-controls-bottom-right')
      if (!host) return
      if (!fillBtn) {
        fillBtn = document.createElement('button')
        fillBtn.type = 'button'
        fillBtn.id = 'ytx-fill-btn'
        fillBtn.setAttribute('data-ytx-own', '')
        fillBtn.setAttribute('aria-label', 'Bild füllen')
        const ns = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(ns, 'svg')
        svg.setAttribute('viewBox', '0 0 24 24')
        const path = document.createElementNS(ns, 'path')
        path.setAttribute('d', 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z')
        svg.append(path)
        fillBtn.append(svg)
        fillBtn.classList.toggle('on', fillOn)
        fillBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          setFill(!fillOn)
        })
      }
      if (fillBtn.parentElement !== host) host.append(fillBtn)
    }
    // YouTube blendet seine Symbole einzeln aus, der Knopf uebernimmt die Sichtbarkeit des Vollbild Knopfs daneben
    const mirror = setInterval(() => {
      if (!fillBtn || !fillBtn.parentElement) return
      const host = fillBtn.parentElement
      const ref = host.querySelector('.fullscreen-icon')
      if (!ref) return
      let op = 1
      let vis = true
      for (let e = ref; e && e !== host; e = e.parentElement) {
        const cs = getComputedStyle(e)
        op *= Number(cs.opacity)
        if (cs.visibility === 'hidden' || cs.display === 'none') vis = false
      }
      fillBtn.style.opacity = String(op)
      fillBtn.style.visibility = vis ? 'visible' : 'hidden'
      fillBtn.style.pointerEvents = vis && op > 0.2 ? 'auto' : 'none'
    }, 100)
    const offUpgrade = listen(document, 'click', () => {
      if (!faux || document.fullscreenElement) return
      const box = document.getElementById('player-container-id')
      allowEnter = true
      setTimeout(() => (allowEnter = false), 600)
      box?.requestFullscreen?.().then(() => setFaux(false)).catch(() => {})
    }, { capture: true })
    // Farben der Player Leiste im Vollbild folgen dem Akzent des Looks
    let accSet = false
    const applyAccent = () => {
      if (accSet) return
      // der Akzent des Looks, ist er nicht angepasst (Standardblau), die Textfarbe des Looks
      const cs = getComputedStyle(document.documentElement)
      const custom = (role) => {
        const name = discovered()[role]?.[0]?.name
        if (!name) return null
        const c = normColor(cs.getPropertyValue(name))
        return c && c !== normColor(DARK_REFS[role]) && c !== normColor(LIGHT_REFS[role]) ? name : null
      }
      const name = custom('accent') || discovered().text?.[0]?.name
      if (!name) return
      accSet = true
      document.documentElement.style.setProperty('--ytx-accent', `var(${name})`)
      const menu = discovered().menu?.[0]?.name
      if (menu) document.documentElement.style.setProperty('--ytx-menu', `var(${menu})`)
      document.documentElement.setAttribute('data-ytx-acc', '')
    }
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
      const go = () => {
        const box = document.getElementById('player-container-id')
        allowEnter = true
        setTimeout(() => (allowEnter = false), 600)
        if (box?.requestFullscreen) box.requestFullscreen().catch(() => p.toggleFullscreen?.())
        else p.toggleFullscreen?.()
      }
      // war die seite nach unten gescrollt, sitzt der player nicht an seinem platz, dann klappt das vollbild nicht
      // erst nach oben, kurz warten bis das layout im querformat steht, dann hinein
      if (scrollY > 0 || (document.scrollingElement && document.scrollingElement.scrollTop > 0)) {
        scrollTo(0, 0)
        if (document.scrollingElement) document.scrollingElement.scrollTop = 0
        setTimeout(go, 300)
      } else go()
      // hat es nicht geklappt (keine frische Beruehrung), fuellt der Player die Seite selbst
      setTimeout(() => {
        if (innerWidth > innerHeight && innerHeight >= 250 && !isFull() && !document.hidden) setFaux(true)
      }, 900)
    }
    const isFull = () => faux || !!document.fullscreenElement || document.body?.getAttribute('faux-fullscreen') === 'true'
    const t = setInterval(() => {
      const land = innerWidth > innerHeight && innerHeight >= 250
      const p = document.getElementById('movie_player')
      const watching = pageFromUrl(location.href) === 'watch' && p
      // wie in der youtube app: quer gehalten ist das video im vollbild, hochkant wieder normal
      // auch ein video das erst im querformat geladen wird geht ins vollbild, einmal pro video
      // nur die video id zaehlt, die adresse aendert sich beim abspielen sonst weiter
      const vid = watching ? new URLSearchParams(location.search).get('v') || '' : ''
      if (land !== wasLand && watching) {
        wasLand = land
        if (land && !isFull()) enterFs(p)
        if (!land && isFull()) faux ? setFaux(false) : p.toggleFullscreen?.()
        autoFor = land ? vid : ''
        exitedFor = ''
      } else if (land && watching && vid && vid !== autoFor && vid !== exitedFor && p.getPlayerState?.() === 1 && !isFull()) {
        autoFor = vid
        enterFs(p)
      } else wasLand = land
      // selbst beendet: fuer dieses video nicht wieder automatisch hinein
      if (wasFull && !isFull() && land) exitedFor = autoFor = vid
      // nach dem Verlassen des Vollbilds muss YouTube Player und Liste neu ausrichten, sonst bleibt die Hoehe vom Querformat stehen
      if (wasFull && !isFull()) {
        setFill(false)
        for (const ms of [200, 700, 1500]) setTimeout(() => window.dispatchEvent(new Event('resize')), ms)
      }
      wasFull = isFull()
      if (faux && (!watching || !land)) setFaux(false)
      applyAccent()
      if (watching && !land && !isFull()) {
        if (vid !== lastWatchVid) {
          lastWatchVid = vid
          heals = 0
        }
        badTicks = playerGone() ? badTicks + 1 : 0
        if (badTicks >= 3 && (pinned !== playerBox() || !pinned.hasAttribute('data-ytx-pin'))) healLayout()
        else if (pinned && playerBox() === pinned) pinned.setAttribute('data-ytx-pin', '')
      } else {
        badTicks = 0
        if (pinned && (!watching || land || isFull())) unpinPlayer()
      }
      if (isFull()) ensureBtn()
      if (fillOn && (!isFull() || !land)) setFill(false)
      else if (fillOn) fillScale()
      const on = isFull() && land
      document.documentElement.toggleAttribute('data-ytx-fs', on)
      if (on === last) return
      last = on
      window.__ytxNative({ a: on ? 'fsOn' : 'fsOff' })
    }, 250)
    return () => {
      clearInterval(t)
      clearInterval(mirror)
      unpinPlayer()
      offUpgrade()
      offClick()
      fillBtn?.remove()
      setFill(false)
      if (origRequest) Element.prototype.requestFullscreen = origRequest
      if (last) window.__ytxNative({ a: 'fsOff' })
    }
  }
}

export const behaviors = [...yt.filter((b) => SHARED.includes(b.id)), swipeDownBack, tapSeek, thumbPreview, pullRefresh, appFullscreen, audioFocus, relatedDates, playlistRemove]

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
