// dom bauen ohne innerHTML wegen trusted types
export function h(tag, props, ...children) {
  const el = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k === 'text') el.textContent = v
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'value' && 'value' in el) el.value = v
      else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v
      else el.setAttribute(k, v === true ? '' : String(v))
    }
  }
  appendChildren(el, children)
  return el
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove()
  return el
}

export function qs(sel, root = document) {
  try { return root.querySelector(sel) } catch { return null }
}

export function qsa(sel, root = document) {
  try { return Array.from(root.querySelectorAll(sel)) } catch { return [] }
}

// erster treffer aus einer selektorliste
export function qsFirst(list, root = document) {
  for (const s of list) {
    const el = qs(s, root)
    if (el) return el
  }
  return null
}

export function qsaAll(list, root = document) {
  const out = new Set()
  for (const s of list) for (const el of qsa(s, root)) out.add(el)
  return Array.from(out)
}

export function isVisible(el) {
  return !!(el && el.isConnected && el.getClientRects().length)
}

export function validSelector(sel) {
  try {
    document.createDocumentFragment().querySelector(sel)
    return true
  } catch {
    return false
  }
}

export function whenBody(fn) {
  if (document.body) return fn()
  const mo = new MutationObserver(() => {
    if (document.body) {
      mo.disconnect()
      fn()
    }
  })
  mo.observe(document.documentElement, { childList: true })
}
