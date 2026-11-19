// youtube beschreibt jede seite als baum aus benannten bausteinen (fooRenderer, barViewModel)
// neue namen zeigen neue regale, werbeformen oder umbauten, bevor etwas kaputt geht

const TYPE = /^[a-z][A-Za-z0-9]*(Renderer|ViewModel)$/

// sammelt alle bausteine eines json baums, je name der erste uebergeordnete baustein
export function collectTypes(obj, out = new Map(), parent = '', depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 80) return out
  if (Array.isArray(obj)) {
    for (const x of obj) collectTypes(x, out, parent, depth + 1)
    return out
  }
  for (const k in obj) {
    const v = obj[k]
    if (TYPE.test(k)) {
      if (!out.has(k)) out.set(k, parent)
      collectTypes(v, out, k, depth + 1)
    } else collectTypes(v, out, parent, depth + 1)
  }
  return out
}

// passende html elemente zu einem baustein, zum zeigen und fotografieren
export function typeTags(name) {
  const kebab = name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
  return [kebab, `yt-${kebab}`, `ytm-${kebab}`, `ytd-${kebab}`, `ytmusic-${kebab}`]
}

export function siteOfHost(host) {
  if (host.startsWith('music.')) return 'music'
  if (host.startsWith('m.')) return 'mobile'
  return 'youtube'
}
