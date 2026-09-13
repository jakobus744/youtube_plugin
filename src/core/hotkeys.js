import { listen } from './lifecycle.js'
import { log } from './log.js'

const actions = new Map()
let bindings = {}

export function registerAction(id, label, run, defaultKey = '') {
  actions.set(id, { id, label, run, defaultKey })
  return () => actions.delete(id)
}

export function listActions() {
  return Array.from(actions.values())
}

export function setBindings(map) {
  bindings = map || {}
}

export function keyFor(id) {
  const a = actions.get(id)
  return bindings[id] ?? a?.defaultKey ?? ''
}

export function comboFromEvent(e) {
  const parts = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  const k = e.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return parts.join('+')
  // e.code damit alt kombis auf mac und de layouts gleich bleiben
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : k.length === 1 ? k.toUpperCase() : k
  parts.push(key)
  return parts.join('+')
}

function isTyping(e) {
  const path = e.composedPath ? e.composedPath() : [e.target]
  for (const el of path) {
    if (!el || el.nodeType !== 1) continue
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true
  }
  return false
}

export function initHotkeys() {
  listen(
    window,
    'keydown',
    (e) => {
      if (e.repeat) return
      const combo = comboFromEvent(e)
      if (!combo.includes('+') && isTyping(e)) return
      if (isTyping(e) && !e.altKey && !e.ctrlKey) return
      for (const a of actions.values()) {
        const key = keyFor(a.id)
        if (key && key === combo) {
          e.preventDefault()
          e.stopPropagation()
          try { a.run() } catch (err) { log.error(`hotkey ${a.id}`, err) }
          return
        }
      }
    },
    true
  )
}
