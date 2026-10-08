import { setCss, removeCss } from '../core/css.js'
import { h } from '../core/dom.js'
import { pageFromUrl } from '../registry/youtube/pages.js'

// die app zeigt ein laufendes video in einem kleinen fenster, die seite darin ist dieselbe videoseite
// hier wird sie auf das video reduziert und bekommt eigene knoepfe: abspielen, schliessen, tippen zum vergroessern

const CSS = `html[data-ytx-mini], html[data-ytx-mini] body { overflow: hidden !important; background: #000 !important; }
html[data-ytx-mini] ytm-mobile-topbar-renderer, html[data-ytx-mini] .mobile-topbar-header-background, html[data-ytx-mini] ytm-pivot-bar-renderer,
html[data-ytx-mini] .watch-below-the-player, html[data-ytx-mini] ytm-consent-bump-v2-renderer, html[data-ytx-mini] ytm-custom-control, html[data-ytx-mini] [data-ytx-mount], html[data-ytx-mini] .ytx-watch-row { display: none !important; }
html[data-ytx-mini] #player-container-id { position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 2147483000 !important; }
html[data-ytx-mini] #player, html[data-ytx-mini] #movie_player { width: 100% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; }
html[data-ytx-mini] #movie_player .html5-video-container, html[data-ytx-mini] #movie_player video { width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; }
#ytx-mini-ui { position: fixed; inset: 0; z-index: 2147483600; background: transparent; }
#ytx-mini-ui button { all: initial; position: absolute; width: 36px; height: 36px; border-radius: 18px; background: rgba(0,0,0,.6); color: #fff; font: 700 16px/36px sans-serif; text-align: center; cursor: pointer; }
#ytx-mini-ui .ytx-mini-play { left: 6px; bottom: 6px; }
#ytx-mini-ui .ytx-mini-close { right: 6px; top: 6px; }
#ytx-mini-ui .ytx-mini-next { right: 6px; bottom: 6px; }`

const native = (a) => window.__ytxNative?.({ a })

export function initMiniMode() {
  let ui = null
  let timer = null
  const isMini = () => innerWidth <= 480 && innerHeight <= 300
  const player = () => document.getElementById('movie_player')

  function build() {
    const play = h('button', { class: 'ytx-mini-play', type: 'button', text: '❚❚', 'aria-label': 'Abspielen oder pausieren' })
    const close = h('button', { class: 'ytx-mini-close', type: 'button', text: '✕', 'aria-label': 'Schließen' })
    play.addEventListener('click', (e) => {
      e.stopPropagation()
      const p = player()
      if (!p) return
      if (p.getPlayerState?.() === 1) p.pauseVideo()
      else p.playVideo()
    })
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      native('close')
    })
    const next = h('button', { class: 'ytx-mini-next', type: 'button', text: '⏭', 'aria-label': 'Nächstes Video' })
    next.addEventListener('click', (e) => {
      e.stopPropagation()
      player()?.nextVideo?.()
    })
    const box = h('div', { id: 'ytx-mini-ui', 'data-ytx-own': '' }, play, next, close)
    // tippen irgendwo sonst holt das video zurueck
    box.addEventListener('click', () => native('expand'))
    box.__play = play
    return box
  }

  function tick() {
    const on = isMini() && pageFromUrl(location.href) === 'watch'
    const html = document.documentElement
    if (on === html.hasAttribute('data-ytx-mini')) {
      if (on && ui) ui.__play.textContent = player()?.getPlayerState?.() === 1 ? '❚❚' : '▶'
      return
    }
    html.toggleAttribute('data-ytx-mini', on)
    if (on) {
      setCss('mobile.mini', CSS)
      ui = build()
      ;(document.body || html).append(ui)
    } else {
      removeCss('mobile.mini')
      ui?.remove()
      ui = null
    }
  }

  timer = setInterval(tick, 400)
  addEventListener('resize', tick)
  tick()
  return () => clearInterval(timer)
}
