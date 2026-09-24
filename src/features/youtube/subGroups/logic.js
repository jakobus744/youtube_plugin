// abo gruppen, reine logik
// gruppen liegen profiluebergreifend im store bucket, kanaele werden ueber id, handle oder namen erkannt

export const GROUPS_BUCKET = 'youtube.subGroups'
export const NONE = '__none'

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x)
const lower = (s) => String(s || '').trim().toLowerCase()

export function channelKey(ch) {
  return ch?.id || (ch?.handle ? lower(ch.handle) : null) || (ch?.name ? `name:${lower(ch.name)}` : null)
}

function cleanChannel(c) {
  if (!isObj(c)) return null
  const ch = { id: typeof c.id === 'string' && c.id ? c.id : null, handle: c.handle ? lower(c.handle) : null, name: String(c.name || '').trim() }
  return channelKey(ch) ? ch : null
}

export function normalizeGroups(raw) {
  const out = { groups: [] }
  const seen = new Set()
  for (const g of isObj(raw) && Array.isArray(raw.groups) ? raw.groups : []) {
    if (!isObj(g) || !String(g.name || '').trim()) continue
    let id = String(g.id || '').trim() || `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    while (seen.has(id)) id += 'x'
    seen.add(id)
    const chans = new Map()
    for (const c of Array.isArray(g.channels) ? g.channels : []) {
      const ch = cleanChannel(c)
      if (ch && !chans.has(channelKey(ch))) chans.set(channelKey(ch), ch)
    }
    out.groups.push({ id, name: String(g.name).trim().slice(0, 40), channels: [...chans.values()] })
  }
  return out
}

// passt ein kanal einer kachel zu einem gespeicherten kanal
export function sameChannel(a, b) {
  if (!a || !b) return false
  if (a.id && b.id) return a.id === b.id
  if (a.handle && b.handle) return lower(a.handle) === lower(b.handle)
  return !!a.name && !!b.name && lower(a.name) === lower(b.name)
}

export function groupsOf(ch, data) {
  return data.groups.filter((g) => g.channels.some((c) => sameChannel(c, ch)))
}

// sichtbar im feed wenn gruppe passt, ohne aktive gruppe alles
export function visibleIn(ch, groupId, data) {
  if (!groupId) return true
  if (groupId === NONE) return !groupsOf(ch, data).length
  const g = data.groups.find((x) => x.id === groupId)
  return g ? g.channels.some((c) => sameChannel(c, ch)) : true
}

export function toggleChannel(data, groupId, ch) {
  const g = data.groups.find((x) => x.id === groupId)
  if (!g) return false
  const i = g.channels.findIndex((c) => sameChannel(c, ch))
  if (i >= 0) {
    g.channels.splice(i, 1)
    return false
  }
  g.channels.push({ id: ch.id || null, handle: ch.handle || null, name: ch.name || '' })
  return true
}

// id oder handle nachtragen wenn ein kanal spaeter mit mehr daten gesehen wird
export function enrich(data, ch) {
  let changed = false
  for (const g of data.groups) {
    for (const c of g.channels) {
      if (!sameChannel(c, ch)) continue
      if (!c.id && ch.id) (c.id = ch.id), (changed = true)
      if (!c.handle && ch.handle) (c.handle = lower(ch.handle)), (changed = true)
      if (!c.name && ch.name) (c.name = ch.name), (changed = true)
    }
  }
  return changed
}
