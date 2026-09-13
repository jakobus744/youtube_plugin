import { anchors } from '../registry/anchors.js'
import { qsa, isVisible } from './dom.js'
import { onSweep, requestSweep } from './observer.js'
import { onDispose } from './lifecycle.js'
import { log } from './log.js'

const mounts = new Map()
const anchorStatus = new Map()

export function resolveAnchor(id, root = document) {
  const a = anchors[id]
  if (!a) {
    log.warn(`anker unbekannt ${id}`)
    return null
  }
  let fallback = null
  for (const sel of a.sel) {
    for (const el of qsa(sel, root)) {
      if (isVisible(el)) {
        anchorStatus.set(id, { ok: true, sel, at: Date.now() })
        return el
      }
      fallback ||= el
    }
  }
  anchorStatus.set(id, { ok: !!fallback, sel: fallback ? 'unsichtbar' : null, at: Date.now() })
  return a.visibleOnly ? null : fallback
}

export function getAnchorStatus() {
  return anchorStatus
}

// haengt einen knoten an einen anker und setzt ihn neu ein wenn youtube ihn wegrendert
export function mount({ id, anchor, position = 'append', create, update, when }) {
  const m = { id, anchor, position, create, update, when, node: null, host: null, ok: false }
  mounts.set(id, m)
  place(m)
  requestSweep()
  return {
    get node() { return m.node },
    get ok() { return m.ok },
    refresh: () => place(m),
    destroy: () => {
      m.node?.remove()
      mounts.delete(id)
    }
  }
}

function place(m) {
  try {
    if (m.when && !m.when()) {
      if (m.node?.isConnected) m.node.remove()
      m.ok = false
      return
    }
    const list = Array.isArray(m.anchor) ? m.anchor : [m.anchor]
    let host = null
    for (const a of list) {
      host = resolveAnchor(a)
      if (host) break
    }
    if (!host) {
      m.ok = false
      return
    }
    if (!m.node) {
      m.node = m.create()
      m.node.setAttribute('data-ytx-own', '')
      m.node.setAttribute('data-ytx-mount', m.id)
    }
    const placed = m.node.isConnected && m.host === host && isPlaced(m.node, host, m.position)
    if (!placed) {
      if (m.position === 'append') host.append(m.node)
      else if (m.position === 'prepend') host.prepend(m.node)
      else if (m.position === 'before') host.before(m.node)
      else host.after(m.node)
      m.host = host
    }
    m.ok = true
    m.update?.(m.node, host)
  } catch (e) {
    m.ok = false
    log.error(`mount ${m.id}`, e)
  }
}

// andere eigene mounts direkt daneben zaehlen nicht als falsch platziert
function isPlaced(node, host, position) {
  if (position === 'append' || position === 'prepend') return node.parentElement === host
  const step = position === 'after' ? 'nextElementSibling' : 'previousElementSibling'
  let cur = host[step]
  while (cur) {
    if (cur === node) return true
    if (!cur.hasAttribute('data-ytx-mount')) return false
    cur = cur[step]
  }
  return false
}

export function mountStatus() {
  return Array.from(mounts.values()).map((m) => ({ id: m.id, anchor: m.anchor, ok: m.ok }))
}

onSweep('mount', () => {
  for (const m of mounts.values()) place(m)
})

onDispose(() => {
  for (const m of mounts.values()) m.node?.remove()
  mounts.clear()
})
