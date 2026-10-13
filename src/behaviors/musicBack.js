// die zurueck geste der app klappt den grossen player von music zu, wie in der youtube music app
// music legt beim oeffnen des players keinen verlaufseintrag an, ytx legt einen an und nimmt ihn beim zuruecknehmen
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
const collapse = () => {
  const b = document.querySelector('ytmusic-player-page #collapse-button, ytmusic-player-page .collapse-button')
  if (!b) return false
  // polymer knoepfe reagieren auf ihr eigenes tap ereignis, ein klick allein reicht nicht
  tap(b)
  setTimeout(() => isOpen() && (b.querySelector('button') || b).click(), 150)
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
    let was = false
    let pushed = false
    const t = setInterval(() => {
      const open = isOpen()
      if (open && !was && !history.state?.ytxPlayer) {
        history.pushState({ ...(history.state || {}), ytxPlayer: 1 }, '', location.href)
        pushed = true
      } else if (!open && was && pushed && history.state?.ytxPlayer) {
        // selbst zugeklappt: den eigenen eintrag wieder wegnehmen
        pushed = false
        history.back()
      }
      was = open
    }, 300)
    const onPop = () => {
      if (pushed && isOpen()) {
        pushed = false
        was = false
        collapse()
      } else pushed = false
    }
    window.addEventListener('popstate', onPop, true)
    document.addEventListener('click', openFromBar, true)
    return () => {
      clearInterval(t)
      window.removeEventListener('popstate', onPop, true)
      document.removeEventListener('click', openFromBar, true)
    }
  }
}
