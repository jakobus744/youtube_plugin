// zugriff auf die seitenwelt von youtube
export const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : globalThis

export function dataOf(el) {
  if (!el) return null
  try {
    return el.polymerController?.data ?? el.__data?.data ?? el.data ?? null
  } catch {
    return null
  }
}

export function player() {
  const p = document.getElementById('movie_player')
  return p && typeof p.getPlayerResponse === 'function' ? p : null
}

export function ytcfg(key) {
  try { return pageWindow.ytcfg?.get?.(key) } catch { return undefined }
}

// liest verschachtelte pfade wie a.b[0].c
export function pick(obj, path) {
  if (obj == null) return undefined
  let cur = obj
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (part === '') continue
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}

// erster treffer aus mehreren pfaden
export function pickAny(obj, paths) {
  for (const p of paths) {
    let v
    if (typeof p === 'function') {
      try { v = p(obj) } catch { v = undefined }
    } else {
      v = pick(obj, p)
    }
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

export function runsText(t) {
  if (!t) return ''
  if (typeof t === 'string') return t
  if (t.simpleText) return t.simpleText
  if (t.content) return t.content
  if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join('')
  return ''
}

export function capabilities() {
  const host = document.documentElement.getAttribute('data-ytx-site') === 'music' ? 'ytmusic-app' : 'ytd-app'
  const app = document.querySelector(host)
  return {
    polymerData: !!(app && (dataOf(app) || app.polymerController?.store)),
    appFound: !!app,
    playerApi: !!player(),
    gmStorage: typeof GM_getValue === 'function' && typeof GM_setValue === 'function',
    gmClipboard: typeof GM_setClipboard === 'function',
    trustedTypes: !!pageWindow.trustedTypes,
    unsafeWindow: typeof unsafeWindow !== 'undefined'
  }
}
