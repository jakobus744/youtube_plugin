import { setCss, removeCss } from '../core/css.js'
import { h } from '../core/dom.js'
import { pageFromUrl } from '../registry/youtube/pages.js'

// die app zeigt ein laufendes video in einem kleinen fenster, die seite darin ist dieselbe videoseite
// hier wird sie auf das video reduziert, von der bedienung von youtube bleiben vorheriges, pause und naechstes wie im fenster ausserhalb der app
// dazu kommen zwei knoepfe: schliessen und wieder gross machen (der streifen oben, den die app ueber das fenster legt, geht ebenfalls)

const CSS = `html[data-ytx-mini], html[data-ytx-mini] body { overflow: hidden !important; background: #000 !important; }
html[data-ytx-mini] ytm-mobile-topbar-renderer, html[data-ytx-mini] .mobile-topbar-header-background, html[data-ytx-mini] ytm-pivot-bar-renderer,
html[data-ytx-mini] .watch-below-the-player, html[data-ytx-mini] ytm-consent-bump-v2-renderer, html[data-ytx-mini] [data-ytx-mount], html[data-ytx-mini] .ytx-watch-row { display: none !important; }
html[data-ytx-mini] #player-container-id { position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 2147483000 !important; }
html[data-ytx-mini] #player, html[data-ytx-mini] #movie_player { width: 100% !important; height: 100% !important; padding: 0 !important; margin: 0 !important; }
html[data-ytx-mini] .player-controls-top, html[data-ytx-mini] .player-controls-bottom, html[data-ytx-mini] yt-progress-bar, html[data-ytx-mini] .ytmA11yStylesHiddenButton { display: none !important; }
html[data-ytx-mini] #movie_player .html5-video-container, html[data-ytx-mini] #movie_player video { width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; }
.ytx-mini-btn { all: initial; position: fixed; top: 6px; z-index: 2147483600; width: 36px; height: 36px; border-radius: 18px; background: rgba(0,0,0,.6); color: #fff; font: 700 16px/36px sans-serif; text-align: center; cursor: pointer; }
#ytx-mini-ui { right: 6px; }
#ytx-mini-expand { left: 6px; }`

const native = (a) => window.__ytxNative?.({ a })

export function initMiniMode() {
  let ui = null
  let timer = null
  const isMini = () => innerWidth <= 480 && innerHeight <= 300

  function build() {
    const box = h('div', { 'data-ytx-own': '' })
    const close = h('button', { id: 'ytx-mini-ui', class: 'ytx-mini-btn', type: 'button', text: '✕', 'aria-label': 'Schließen' })
    const expand = h('button', { id: 'ytx-mini-expand', class: 'ytx-mini-btn', type: 'button', text: '⤢', 'aria-label': 'Vergrößern' })
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      native('close')
    })
    expand.addEventListener('click', (e) => {
      e.stopPropagation()
      native('expand')
    })
    box.append(expand, close)
    return box
  }

  function tick() {
    const on = isMini() && pageFromUrl(location.href) === 'watch'
    const html = document.documentElement
    if (on === html.hasAttribute('data-ytx-mini')) {
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
