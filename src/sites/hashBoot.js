import { scanPage, tokenCount } from '../appliers/hashTokens.js'
import { store } from '../core/store.js'
import { applyVars } from '../appliers/vars.js'
import { log } from '../core/log.js'

// sucht die hash farbvariablen sobald das css da ist, spaeter geladenes css wird nachgeholt
// hell oder dunkel wird beim ersten fund festgelegt, spaeter stimmen die farben der seite wegen ytx nicht mehr
export function bootHashTokens(isDark, label, onMode) {
  let tries = 0
  let dark = null
  const scan = () => {
    if (dark === null) {
      dark = !!isDark()
      onMode?.(dark)
    }
    const added = scanPage(dark)
    if (added > 0) applyVars(store.config)
    return added
  }
  const t = setInterval(() => {
    const added = scan()
    if (added < 0) dark = null
    if (added >= 0 || ++tries > 40) {
      clearInterval(t)
      log.info(`${label} farben erkannt: ${Object.entries(tokenCount()).map(([k, v]) => `${k} ${v}`).join(', ') || 'keine'}`)
      for (const ms of [4000, 15000, 45000]) setTimeout(scan, ms)
    }
  }, 500)
}
