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

// vorschau auf thumbnails wie in der youtube app: stumm, direkt auf dem bild, mit untertiteln, ziehen spult
// gedrueckt halten startet sie, nach 1,5 Sekunden laeuft sie auch weiter wenn der finger weg ist
// oder ein video liegt in ruhe mitten im bild, dann startet sie von selbst
// ein einziger offizieller einbett player wird wiederverwendet, ein neuer fuer jede vorschau waere zu langsam
const EMBED = 'https://www.youtube.com'
const HOLD_KEEP_MS = 1500
// der Player zeigt nach dem Start etwa 3 Sekunden lang seine Leiste (Teilen, Uhr, Logo), das laesst sich nicht abschalten
// die Vorschau erscheint deshalb erst danach, bis dahin steht das Thumbnail mit dem Ladebalken
const OVERLAY_MS = 3000
const thumbPreview = {
  id: 'thumbPreview',
  label: 'Video-Vorschau auf Thumbnails',
  description: 'Stumme Vorschau mit Untertiteln direkt auf dem Bild, wie in der YouTube-App. Gedrückt halten startet sie, nach 1,5 Sekunden läuft sie auch ohne Finger weiter. Sie beginnt am Anfang des Videos. Nach links oder rechts ziehen spult. „Beim Verweilen“ startet sie von selbst, wenn ein Video in Ruhe mitten im Bild liegt',
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
    let dwell = { link: null, since: 0 }
    let ready = false
    let warmed = false
    let live = null
    let box = null
    let frame = null
    let bar = null
    let curId = ''
    let hs = 0
    const idOf = (a) => (a?.getAttribute('href') || '').match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] || ''
    const thumbLink = (el) => {
      const a = el?.closest?.('a[href*="/watch?v="]')
      if (!a || !a.querySelector('img, [class*="thumbnail"], [class*="image"]')) return null
      const r = a.getBoundingClientRect()
      return r.width > 80 && r.height > 40 ? a : null
    }
    const cmd = (func, ...args) => {
      try { frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), EMBED) } catch {}
    }
    const ensurePlayer = (id) => {
      if (box) return
      box = document.createElement('div')
      box.setAttribute('data-ytx-own', '')
      box.style.cssText = 'position:fixed;z-index:2147483000;left:0;top:0;width:10px;height:10px;background:transparent;pointer-events:none;overflow:hidden;border-radius:8px;visibility:hidden'
      frame = document.createElement('iframe')
      frame.setAttribute('allow', 'autoplay; encrypted-media')
      // unten verankert vergroessert: die Titelzeile oben faellt weg, die Untertitel unten bleiben sichtbar
      // solange nichts spielt (laden, springen) bleibt das Thumbnail darunter stehen statt eines schwarzen Bildes
      frame.style.cssText = 'width:100%;height:100%;border:0;pointer-events:none;transform:scale(1.25);transform-origin:50% 100%;opacity:0;transition:opacity .12s'
      frame.src = `${EMBED}/embed/${id}?autoplay=0&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&fs=0&start=0&iv_load_policy=3&cc_load_policy=1&cc_lang_pref=de&hl=de&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
      curId = id
      const track = document.createElement('div')
      track.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:5px;background:rgba(255,255,255,.3)'
      bar = document.createElement('div')
      bar.style.cssText = 'height:100%;width:0;background:#ff0033'
      track.append(bar)
      box.append(frame, track)
      document.documentElement.append(box)
      hs = setInterval(() => {
        try { frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'ytx', channel: 'widget' }), EMBED) } catch {}
      }, 250)
    }
    const stopLive = () => {
      clearTimeout(timer)
      if (live) {
        cmd('pauseVideo')
        live = null
      }
      if (box) {
        box.style.visibility = 'hidden'
        frame.style.opacity = '0'
        bar.style.width = '0'
      }
      press = null
      drag = null
    }
    // die Vorschau liegt zwischen Kopfzeile und unterer Leiste, nicht darueber
    const place = (r) => {
      const top = document.querySelector('ytm-mobile-topbar-renderer, ytm-mobile-topbar')?.getBoundingClientRect().bottom || 0
      const bottom = document.querySelector('ytm-pivot-bar-renderer')?.getBoundingClientRect().top || innerHeight
      const cutTop = Math.max(0, top - r.top)
      const cutBottom = Math.max(0, r.bottom - bottom)
      Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, clipPath: `inset(${cutTop}px 0 ${cutBottom}px 0)` })
    }
    const startVideo = (id) => {
      if (curId !== id) {
        cmd('mute')
        cmd('loadVideoById', { videoId: id, startSeconds: 0 })
        curId = id
      } else {
        cmd('seekTo', 0, true)
        cmd('playVideo')
      }
    }
    // der Player wird vorab geladen, dann beginnt die Vorschau ohne Wartezeit
    const preload = () => {
      const id = idOf(document.querySelector('a[href*="/watch?v="]'))
      if (id) ensurePlayer(id)
    }
    const begin = (link, how) => {
      const id = idOf(link)
      if (!id) return
      warmed = false
      // wann der Finger aufgesetzt wurde, stopLive loescht press
      const t0 = press ? press.t0 : Date.now()
      stopLive()
      const r = link.getBoundingClientRect()
      ensurePlayer(id)
      // steckt das Video schon im Player, melden die Daten sofort das richtige Video, sonst erst nach dem Laden
      const same = curId === id
      live = { link, id, how, t0, rect: r, dur: 0, state: -1, cur: 0, vidOk: same, shown: false, target: -1, lastSeek: 0, seeking: false, showAt: 0, loadedAt: Date.now() }
      place(r)
      box.style.visibility = 'visible'
      frame.style.opacity = '0'
      bar.style.width = '0'
      // ist der Player noch nicht bereit, startet das Video sobald er sich meldet
      if (!ready) live.pending = true
      else startVideo(id)
    }
    // erst zeigen wenn der Player das richtige Video spielt und es wirklich laeuft, vorher bleibt das Thumbnail stehen
    // (nach einem Wechsel meldet der Player noch kurz Zeit und Laenge des alten Videos, das Poster von YouTube darf nie sichtbar werden)
    // einmal gezeigt bleibt das letzte Bild beim Springen stehen statt zum Thumbnail zurueckzufallen
    const reveal = () => {
      if (!live || !frame) return
      // jedes Laden oder Springen blendet die Vorschau aus (der Player zeigt dann Lade-Rad und Bedienfeld), danach erst wieder nach der Wartezeit
      live.shown = !!(live.vidOk && live.state === 1 && live.dur > 0 && live.cur > 0.15 && !live.seeking && Date.now() >= live.showAt)
      frame.style.opacity = live.shown ? '1' : '0'
    }
    const onMsg = (e) => {
      if (!frame || e.source !== frame.contentWindow) return
      let d
      try { d = JSON.parse(e.data) } catch { return }
      if (!ready) {
        ready = true
        if (live?.pending) {
          live.pending = false
          startVideo(live.id)
        }
      }
      if (!live) return
      if (d.event === 'onError') return stopLive()
      const state = d.event === 'onStateChange' ? d.info : d.info?.playerState
      if (typeof state === 'number') {
        live.state = state
        if (state !== 1) live.notPlaying = true
        else if (live.notPlaying && live.showAt) {
          live.notPlaying = false
          live.showAt = Date.now() + OVERLAY_MS
          setTimeout(reveal, OVERLAY_MS + 30)
        }
        // am Ende von vorn, die Vorschau laeuft so lange das Video im Bild liegt
        if (state === 0 && !live.seeking) {
          cmd('seekTo', 0, true)
          cmd('playVideo')
        }
        if (state === 1 && !live.showAt) {
          live.showAt = Date.now() + OVERLAY_MS
          setTimeout(reveal, OVERLAY_MS + 30)
        }
      }
      const info = d.info
      const vid = info?.videoData?.video_id
      if (vid) live.vidOk = vid === live.id
      // meldet der Player die Video ID nicht, gilt es nach einer Weile trotzdem als das richtige
      else if (!live.vidOk && live.state === 1 && Date.now() - live.loadedAt > 2500) live.vidOk = true
      const dur = info?.duration
      if (!live.dur && dur > 0 && live.vidOk) {
        live.dur = dur
        // die Vorschau beginnt am Anfang des Videos
        cmd('playVideo')
      }
      const cur = info?.currentTime
      if (typeof cur === 'number') live.cur = cur
      if (!live.seeking && live.dur && cur >= 0) bar.style.width = `${Math.min(100, (cur / live.dur) * 100)}%`
      reveal()
    }
    window.addEventListener('message', onMsg)
    const seekTo = (x) => {
      if (!live || !live.dur) return
      live.seeking = true
      live.shown = false
      frame.style.opacity = '0'
      const f = Math.min(1, Math.max(0, (x - live.rect.left) / live.rect.width))
      bar.style.width = `${f * 100}%`
      live.target = f * live.dur
      const now = Date.now()
      if (now - live.lastSeek < 300) return
      live.lastSeek = now
      // auch ungeladene Stellen anfahren, sonst bleibt das Bild beim Ziehen oft stehen
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
      live.shown = false
      live.showAt = Date.now() + OVERLAY_MS
      setTimeout(reveal, OVERLAY_MS + 30)
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
    // der Vorschau Rahmen folgt dem Video beim Scrollen, sie endet erst wenn es aus der Bildmitte verschwindet
    const follow = () => {
      if (!live) return
      const r = live.link.getBoundingClientRect()
      const mid = r.top + r.height / 2
      if (!live.link.isConnected || mid < innerHeight * 0.1 || mid > innerHeight * 0.92) return stopLive()
      live.rect = r
      place(r)
    }
    const poll = setInterval(() => {
      if (document.hidden || document.fullscreenElement || press || drag) return
      if (pageFromUrl(location.href) === 'watch' || navigator.connection?.saveData) return live && stopLive()
      const now = Date.now()
      if (!box) preload()
      if (live) follow()
      if (!auto || now - scrollAt < 350) return
      const c = pickDwell()
      if (c !== dwell.link) {
        dwell = { link: c, since: now }
        return
      }
      if (c && (!live || (live.how === 'auto' && live.link !== c)) && now - dwell.since > 200) begin(c, 'auto')
    }, 150)
    const onScroll = (e) => {
      // nur die Seite selbst, nicht Karussells oder Listen darin
      const t = e.target
      if (t !== document && t !== document.documentElement && t !== document.body) return
      scrollAt = Date.now()
      if (live && live.how === 'auto') follow()
    }
    const inLive = (t) => live && t.clientX >= live.rect.left && t.clientX <= live.rect.right && t.clientY >= live.rect.top && t.clientY <= live.rect.bottom
    const offs = [
      listen(window, 'scroll', onScroll, { passive: true, capture: true }),
      listen(document, 'touchstart', (e) => {
        if (e.touches.length !== 1) return stopLive()
        const t = e.touches[0]
        if (live && live.how === 'auto' && inLive(t)) {
          drag = { x: t.clientX, y: t.clientY, moved: false }
          return
        }
        press = null
        drag = null
        clearTimeout(timer)
        if (!(live && live.how === 'auto')) stopLive()
        const link = thumbLink(e.target)
        if (!link) return
        press = { x: t.clientX, y: t.clientY, link, t0: Date.now() }
        // das Video schon beim Beruehren laden, dann startet die Vorschau ohne Ladezeit
        const wid = idOf(link)
        if (ready && wid && curId !== wid && !live) {
          startVideo(wid)
          warmed = true
        }
        timer = setTimeout(() => {
          if (press) begin(press.link, 'press')
        }, 160)
      }, { passive: true, capture: true }),
      listen(document, 'touchmove', (e) => {
        const t = e.touches[0]
        if (live && live.how === 'press') {
          e.preventDefault()
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
          if (warmed && !live) {
            cmd('pauseVideo')
            warmed = false
          }
        }
      }, { passive: false, capture: true }),
      listen(document, 'touchend', () => {
        clearTimeout(timer)
        if (warmed && !live) {
          cmd('pauseVideo')
          warmed = false
        }
        if (live && live.how === 'press') {
          const held = Date.now() - live.t0
          settleSeek()
          // nach 1,5 Sekunden Halten laeuft die Vorschau weiter, auch ohne Finger
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
      // der Klick nach dem Spulen oder Halten soll das Video nicht oeffnen, ein normaler Tipp oeffnet es wie immer
      listen(document, 'click', (e) => {
        if (Date.now() < suppressUntil) {
          e.stopPropagation()
          e.preventDefault()
        } else if (live) stopLive()
      }, { capture: true })
    ]
    return () => {
      clearInterval(poll)
      clearInterval(hs)
      window.removeEventListener('message', onMsg)
      offs.forEach((off) => off())
      stopLive()
      box?.remove()
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
        location.reload()
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

export const behaviors = [...yt.filter((b) => SHARED.includes(b.id)), swipeDownBack, tapSeek, thumbPreview, pullRefresh, appFullscreen, audioFocus]

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
