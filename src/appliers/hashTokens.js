// youtube nennt viele farbvariablen nach einem hash (--t3e41d7b…), die namen wechseln mit jedem build
// sie werden zur laufzeit an ihrem wert erkannt und mit den ytx farben ueberschrieben
// gilt fuer m.youtube.com und inzwischen auch fuer den rechner (z. b. feste kopfleisten in playlists)

// farbe in vergleichbare form: #rrggbb oder #rrggbb@alpha
export function normColor(v) {
  const s = String(v || '').trim().toLowerCase().replace(/\s+/g, '')
  let m = s.match(/^#([0-9a-f]{3})$/)
  if (m) return `#${[...m[1]].map((c) => c + c).join('')}`
  if (/^#[0-9a-f]{6}$/.test(s)) return s
  m = s.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/)
  if (!m) return null
  const hex = `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`
  const a = m[4] == null ? 1 : Number(m[4])
  return a >= 1 ? hex : `${hex}@${Math.round(a * 1000) / 1000}`
}

// vars: [[name, wert]], refs: rolle -> farbe der seite
// liefert rolle -> [{ name, alpha }], transparente varianten der grundfarbe werden mitgenommen
export function discoverTokens(vars, refs) {
  const out = {}
  const wanted = Object.entries(refs).map(([role, v]) => [role, normColor(v)]).filter(([, v]) => v)
  for (const [name, raw] of vars) {
    if (!/^--t[0-9a-f]{8,}$/.test(name)) continue
    const c = normColor(raw)
    if (!c) continue
    const [hex, alpha] = c.split('@')
    for (const [role, ref] of wanted) {
      if (ref === c || (role === 'bg' && alpha && ref === hex)) (out[role] ||= []).push({ name, alpha: alpha ? Number(alpha) : 1 })
    }
  }
  return out
}

// standardfarben von youtube, nicht die aktuell berechneten (die sind nach dem ersten anwenden schon ueberschrieben)
export const DARK_REFS = { bg: '#0f0f0f', text: '#f1f1f1', textSecondary: '#aaaaaa', raised: '#212121', menu: '#282828', accent: '#3ea6ff' }
export const LIGHT_REFS = { bg: '#ffffff', text: '#0f0f0f', textSecondary: '#606060', accent: '#065fd4' }

let found = {}
const known = new Set()

export function setDiscovered(map) {
  found = map || {}
  known.clear()
  for (const list of Object.values(found)) for (const t of list) known.add(t.name)
}

export function discovered() {
  return found
}

// liest die hash variablen am html element, neue namen werden ergaenzt, bekannte bleiben
// liefert die zahl neu gefundener variablen oder -1 wenn das css noch fehlt
export function scanPage(dark) {
  const cs = getComputedStyle(document.documentElement)
  const vars = []
  let total = 0
  for (let i = 0; i < cs.length; i++) {
    const n = cs[i]
    if (!n.startsWith('--t')) continue
    total++
    if (!known.has(n)) vars.push([n, cs.getPropertyValue(n)])
  }
  if (!total) return -1
  const map = discoverTokens(vars, dark ? DARK_REFS : LIGHT_REFS)
  let added = 0
  for (const [role, list] of Object.entries(map)) {
    for (const t of list) {
      ;(found[role] ||= []).push(t)
      known.add(t.name)
      added++
    }
  }
  // auch nicht passende namen merken, damit spaetere scans nur neue lesen
  for (const [n] of vars) known.add(n)
  return added
}

export function tokenCount() {
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length]))
}

// deklarationen fuer die gefundenen variablen
export function hashTokenDecls(colors, roles) {
  const decl = []
  for (const role of roles) {
    const v = colors[role]
    if (!v) continue
    for (const t of found[role] || []) decl.push(`${t.name}: ${t.alpha < 1 ? `color-mix(in srgb, ${v} ${Math.round(t.alpha * 100)}%, transparent)` : v} !important;`)
  }
  return decl
}
