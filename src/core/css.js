import { onDispose } from './lifecycle.js'

const sheets = new Map()

export function setCss(id, text) {
  let el = sheets.get(id)
  if (!el) {
    el = document.createElement('style')
    el.setAttribute('data-ytx-own', '')
    el.setAttribute('data-ytx-css', id)
    sheets.set(id, el)
  }
  if (el.textContent !== text) el.textContent = text
  if (!el.isConnected) (document.head || document.documentElement).append(el)
}

export function removeCss(id) {
  const el = sheets.get(id)
  if (el) {
    el.remove()
    sheets.delete(id)
  }
}

// youtube tauscht manchmal head inhalte daher neu anhaengen
export function ensureCss() {
  for (const el of sheets.values()) {
    if (!el.isConnected) (document.head || document.documentElement).append(el)
  }
}

export function cssStats() {
  let rules = 0
  for (const el of sheets.values()) rules += el.sheet?.cssRules?.length || 0
  return { sheets: sheets.size, rules }
}

onDispose(() => {
  for (const el of sheets.values()) el.remove()
  sheets.clear()
})
