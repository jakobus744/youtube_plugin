import { currentTrack, navigateEndpoint, endpoints } from '../registry/music/player.js'

// die zurueck geste der app klappt den grossen player von music zu, wie in der youtube music app
// music legt beim oeffnen des players selbst einen verlaufseintrag an (die adresse wechselt auf /watch), die app geht dann ganz normal zurueck
const CLOSED = ['', 'PLAYER_BAR_ONLY', 'INACTIVE', 'MINIPLAYER']

const isOpen = () => {
  const s = document.querySelector('ytmusic-app-layout')?.getAttribute('player-ui-state') || ''
  return !CLOSED.includes(s)
}

const tap = (el) => el.dispatchEvent(new CustomEvent('tap', { bubbles: true, composed: true, detail: { x: 0, y: 0 } }))

// ein tipp irgendwo auf die leiste unten oeffnet den player, nicht nur auf bild oder titel (knoepfe und zeitleiste bleiben wie sie sind)
const INTERACTIVE = 'button, a, tp-yt-paper-slider, tp-yt-paper-icon-button, yt-icon-button, ytmusic-like-button-renderer, #progress-bar, .right-controls, .left-controls, input'
const openFromBar = (e) => {
  const bar = e.target?.closest?.('ytmusic-player-bar')
  if (!bar || isOpen() || e.target.closest(INTERACTIVE)) return
  const part = bar.querySelector('.thumbnail-image-wrapper, .image, .content-info-wrapper, .middle-controls')
  if (!part || part.contains(e.target)) return
  tap(part)
  setTimeout(() => !isOpen() && part.click(), 150)
}

// zuklappen ueber den knopf, den music selbst dafuer hat
// ein zweiter klick nur, wenn der player nach einer Weile noch offen ist, sonst klappt er gleich wieder auf
const collapse = () => {
  const b = document.querySelector('ytmusic-player-page #collapse-button, ytmusic-player-page .collapse-button')
  if (!b) return false
  // polymer knoepfe reagieren auf ihr eigenes tap ereignis, ein klick allein reicht nicht
  tap(b)
  let waited = 0
  const check = setInterval(() => {
    waited += 50
    if (!isOpen()) clearInterval(check)
    else if (waited >= 450) {
      clearInterval(check)
      ;(b.querySelector('button') || b).click()
    }
  }, 50)
  return true
}

export const musicBack = {
  id: 'm.backClosesPlayer',
  label: 'Player: Zurück klappt zu, Tipp auf die Leiste öffnet (App)',
  description: 'Wie in der YouTube-Music-App: Die Zurück-Geste schließt den großen Player, ein Tipp irgendwo auf die Leiste unten öffnet ihn',
  type: 'toggle',
  default: true,
  start() {
    if (!window.__ytxNative) return () => {}
    // startet die app direkt im player (letzter titel, geteilter link), fehlt darunter die startseite im verlauf
    // zurueck sprang dann ins leere oder oeffnete den player wieder, deshalb die startseite als eintrag darunter legen
    const underlay = () => {
      if (history.length !== 1 || !location.pathname.startsWith('/watch') || history.state?.ytxHome) return
      const st = history.state
      const url = location.href
      history.replaceState({ ytxHome: 1, command: { browseEndpoint: { browseId: 'FEmusic_home' } } }, '', '/')
      history.pushState(st, '', url)
    }
    // music zeigt beim zurueckspringen auf diesen eintrag sonst nichts an, dann selbst zur startseite
    const onPop = () => {
      if (!history.state?.ytxHome) return
      setTimeout(() => {
        if (isOpen()) collapse()
        if (!document.querySelector('ytmusic-browse-response:not([hidden])')) location.replace('/')
      }, 400)
    }
    // das layout entsteht erst nach dem start der seite
    const wait = setInterval(() => {
      if (!document.querySelector('ytmusic-app-layout')) return
      clearInterval(wait)
      underlay()
    }, 300)
    window.addEventListener('popstate', onPop, true)
    document.addEventListener('click', openFromBar, true)
    return () => {
      clearInterval(wait)
      window.removeEventListener('popstate', onPop, true)
      document.removeEventListener('click', openFromBar, true)
    }
  }
}

// im grossen player und in der leiste ist der kuenstlername auf dem handy nur text ohne link
export const musicByline = {
  id: 'm.bylineOpensArtist',
  label: 'Player: Tipp auf den Künstlernamen öffnet den Künstler',
  description: 'Im großen Player führt ein Tipp auf den Künstlernamen zur Künstler-Seite, der Player klappt dabei zu. Auf dem Handy ist der Name sonst nur Text',
  type: 'toggle',
  default: true,
  start() {
    const onClick = (e) => {
      const by = e.target?.closest?.('ytmusic-player-page ytmusic-player-controls .byline')
      if (!by || e.target.closest('a') || !isOpen()) return
      const id = currentTrack()?.artists?.find((a) => a.id)?.id
      // der seitenwechsel klappt den player selbst zu
      if (id) navigateEndpoint(endpoints.browse(id, null, 'ARTIST'))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }
}
