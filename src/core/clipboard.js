import { log } from './log.js'

export const clipboardState = { last: null, method: null }

// gm zuerst weil es keine nutzergeste braucht
export async function copyText(text) {
  clipboardState.last = text
  if (typeof GM_setClipboard === 'function') {
    try {
      GM_setClipboard(text, 'text')
      clipboardState.method = 'gm'
      return true
    } catch (e) {
      log.warn('GM_setClipboard', e)
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    clipboardState.method = 'navigator'
    return true
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.append(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) {
      clipboardState.method = 'execCommand'
      return true
    }
  } catch {}
  clipboardState.method = 'failed'
  log.warn('clipboard: kopieren fehlgeschlagen')
  return false
}
