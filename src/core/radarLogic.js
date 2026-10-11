// Feature Radar: merkt sich, welche YouTube Elemente und Experiment Schalter schon gesehen wurden
// was nach der Eingewoehnung neu auftaucht, ist meist eine neue Funktion von YouTube
// reine Logik ohne dom, damit sie getestet werden kann

export const BASELINE_MS = 3 * 24 * 3600 * 1000
const MAX = 4000

export const emptyState = () => ({ since: 0, tags: {}, flags: {}, fresh: [] })

// Elementnamen die zur Oberflaeche von YouTube gehoeren
export function isInteresting(tag) {
  return /^(ytm?d?-|ytmusic-|yt-)/.test(tag) || /-(view-model|renderer)$/.test(tag)
}

// state: gespeicherter Stand, tags: Namen der aktuell sichtbaren Elemente, flags: Namen aktiver Experiment Schalter
// liefert true wenn sich etwas geaendert hat
export function applyScan(state, { tags, flags, page, now }) {
  if (!state.since) state.since = now
  const settling = now - state.since < BASELINE_MS
  let changed = false
  const seen = (kind, names) => {
    const known = state[kind]
    for (const n of names) {
      if (n in known) continue
      if (Object.keys(known).length >= MAX) break
      known[n] = now
      changed = true
      if (!settling) state.fresh.push({ kind, name: n, at: now, page })
    }
  }
  seen('tags', tags)
  seen('flags', flags)
  if (state.fresh.length > 300) state.fresh.splice(0, state.fresh.length - 300)
  return changed
}

// neue Eintraege als bekannt markieren
export function acknowledge(state) {
  const n = state.fresh.length
  state.fresh = []
  return n
}

// Text fuer den Bericht oder die Zwischenablage
export function describeFresh(state, locale = 'de-DE') {
  return state.fresh.map((f) => `${new Date(f.at).toLocaleDateString(locale)}  ${f.kind === 'tags' ? 'Element' : 'Schalter'}  ${f.name}  (${f.page || '?'})`)
}
