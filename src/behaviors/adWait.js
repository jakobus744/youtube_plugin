import { pageWindow } from '../core/bridge.js'
import { listen } from '../core/lifecycle.js'
import { pageFromUrl } from '../registry/youtube/pages.js'

// ohne premium schickt youtube bei geblockter werbung eine wartezeit (backoffTimeMs) mit
// der videolader merkt sie sich als this.D = jetzt + wartezeit und laedt vorher kein bild
// hier wird der wert nur mitgelesen, damit im schwarzbild ein countdown stehen kann

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// der lader ist am feldsatz erkennbar, nur lesbare namen aus base.js
// kurznamen wie Ka oder Mb wechseln mit jeder player version
export function isLoader(o) {
  return !!o && typeof o === 'object' && has(o, 'loader') && has(o, 'policy') && has(o, 'audioTrack') && has(o, 'videoTrack')
}

// meldet jede neue frist des laders an onDeadline, der wert selbst bleibt unveraendert
export function watchDeadline(proto, onDeadline) {
  if (has(proto, 'D')) return () => {}
  let on = true
  const plain = (o, v) => {
    try {
      Object.defineProperty(o, 'D', { value: v, writable: true, configurable: true, enumerable: true })
    } catch {}
  }
  Object.defineProperty(proto, 'D', {
    configurable: true,
    get() {
      return undefined
    },
    set(v) {
      if (!on || !isLoader(this)) return plain(this, v)
      let val = v
      const report = (x) => {
        if (on && typeof x === 'number') {
          try { onDeadline(x) } catch {}
        }
      }
      try {
        Object.defineProperty(this, 'D', {
          configurable: true,
          enumerable: true,
          get: () => val,
          set: (x) => {
            val = x
            report(x)
          }
        })
      } catch {}
      report(v)
    }
  })
  return () => {
    on = false
    delete proto.D
  }
}

// restzeit in ganzen sekunden, nie unter null
export function secondsLeft(deadline, now) {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

// fuer den pruefmodus: wie oft der lader erkannt wurde und die letzte wartezeit
export const adWaitSeen = { count: 0, lastMs: null }

// kuerzere wartezeiten kommen auch ohne werbung vor, darunter keine anzeige
const MIN_WAIT_MS = 1500

const CSS = `
.ytx-adwait{position:absolute;inset:0;z-index:60;display:grid;grid-template-rows:1fr 70px 1fr;justify-items:center;pointer-events:none;color:#fff;font:500 15px/1.3 Roboto,Arial,sans-serif;text-align:center;background:rgba(0,0,0,.55)}
.ytx-adwait>div{display:flex;flex-direction:column;align-items:center;gap:4px}
.ytx-adwait>div:first-child{grid-row:1;align-self:end}
.ytx-adwait>div:last-child{grid-row:3;align-self:start}
.ytx-adwait b{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums}
.ytx-adwait small{opacity:.8;font-size:12px}
`

export const adWait = {
  id: 'adWait',
  label: 'Countdown statt Schwarzbild bei geblockter Werbung',
  description: 'Ohne Premium hält YouTube das Video nach geblockter Werbung einige Sekunden zurück. ytx zeigt in dieser Zeit an, wie lange es noch dauert',
  type: 'toggle',
  default: true,
  start() {
    const w = pageWindow
    let deadline = 0
    let box = null
    let timer = 0
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    const hide = () => {
      clearInterval(timer)
      timer = 0
      box?.remove()
      box = null
    }
    const draw = () => {
      if (!box) return
      const s = secondsLeft(deadline, Date.now())
      box.querySelector('b').textContent = s > 0 ? `${s} s` : 'gleich'
    }
    const show = () => {
      if (pageFromUrl(location.href) !== 'watch') return
      const v = document.querySelector('#movie_player video, .html5-video-player video')
      const host = document.querySelector('#movie_player') || v?.closest('.html5-video-player')
      if (!host || (v && v.readyState >= 2)) return
      if (!box) {
        box = document.createElement('div')
        box.className = 'ytx-adwait'
        box.setAttribute('data-ytx-own', '')
        // oben der titel, in der mitte bleibt platz fuer den ladekreis von youtube, unten die zeit
        const top = document.createElement('div')
        const bottom = document.createElement('div')
        for (const [parent, tag, text] of [[top, 'span', 'Werbung geblockt'], [top, 'small', 'YouTube hält das Video so lange zurück'], [bottom, 'b', '']]) {
          const el = document.createElement(tag)
          el.textContent = text
          parent.append(el)
        }
        box.append(top, bottom)
        host.append(box)
      }
      draw()
      clearInterval(timer)
      timer = setInterval(() => {
        if (!box?.isConnected || pageFromUrl(location.href) !== 'watch') return hide()
        draw()
      }, 250)
    }
    let off = () => {}
    try {
      off = watchDeadline(w.Object.prototype, (d) => {
        // die frist entsteht beim tippen auf abspielen, gemessen wird gegen die echte uhr
        adWaitSeen.count++
        adWaitSeen.lastMs = d - Date.now()
        if (d - Date.now() < MIN_WAIT_MS) return
        deadline = d
        setTimeout(show, 0)
      })
    } catch {}
    const done = (e) => {
      if (e.target?.tagName === 'VIDEO' && box) hide()
    }
    const offs = [
      listen(document, 'playing', done, true),
      listen(document, 'loadeddata', done, true),
      listen(document, 'emptied', done, true),
      listen(window, 'yt-navigate-start', hide, true)
    ]
    return () => {
      hide()
      off()
      style.remove()
      offs.forEach((o) => o())
    }
  }
}
