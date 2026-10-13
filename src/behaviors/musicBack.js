// die zurueck geste der app klappt den grossen player von music zu, wie in der youtube music app
// music legt beim oeffnen des players selbst einen verlaufseintrag an (die adresse wechselt auf /watch), die app geht dann ganz normal zurueck
// nur ohne vorherigen eintrag (die app startet mit offenem player) bleibt zurueck wirkungslos, dafuer legt ytx einen eintrag an
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
    let pushed = false
    // sofort reagieren statt zu warten, sonst fehlt der eintrag, wenn zurueck gleich nach dem oeffnen kommt
    const sync = () => {
      const open = isOpen()
      if (open && !pushed && history.length <= 1) {
        history.pushState({ ytxPlayer: 1 }, '', location.href)
        pushed = true
      } else if (!open && pushed) {
        // selbst zugeklappt, der eigene eintrag wird wieder weggenommen
        pushed = false
        if (history.state?.ytxPlayer) history.back()
      }
    }
    let mo = null
    const watch = () => {
      const layout = document.querySelector('ytmusic-app-layout')
      if (!layout || mo) return !!mo
      mo = new MutationObserver(sync)
      mo.observe(layout, { attributes: true, attributeFilter: ['player-ui-state'] })
      sync()
      return true
    }
    // das layout entsteht erst nach dem start der seite
    const wait = setInterval(() => watch() && clearInterval(wait), 400)
    const onPop = () => {
      if (pushed && isOpen()) {
        pushed = false
        collapse()
      } else pushed = false
    }
    window.addEventListener('popstate', onPop, true)
    document.addEventListener('click', openFromBar, true)
    return () => {
      clearInterval(wait)
      mo?.disconnect()
      window.removeEventListener('popstate', onPop, true)
      document.removeEventListener('click', openFromBar, true)
    }
  }
}
