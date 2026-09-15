import { localProvider } from './local.js'
import { musicbrainzProvider } from './musicbrainz.js'
import { lastfmProvider } from './lastfm.js'
import { ollamaProvider } from './ollama.js'

// austauschbare quellen fuer zusatzwissen ueber musik
// jede quelle kann einzelne faehigkeiten liefern, fehlende geben leere listen
// lokal funktioniert immer, externe sind aus bis sie im panel eingeschaltet werden
//
// schnittstelle:
//   id, label, external, note
//   available(prefs) -> bool
//   similarArtists(artist, prefs) -> [{ id, name, source }]
//   genresOf(artist, prefs) -> [string]
//   describe(track, prefs) -> string | null

export const providers = [localProvider, musicbrainzProvider, lastfmProvider, ollamaProvider]

export function activeProviders(prefs) {
  return providers.filter((p) => prefs.providers?.[p.id]?.enabled && p.available(prefs))
}

async function collect(prefs, method, ...args) {
  const out = []
  for (const p of activeProviders(prefs)) {
    if (typeof p[method] !== 'function') continue
    try {
      const r = await p[method](...args, prefs)
      if (Array.isArray(r)) out.push(...r.map((x) => (typeof x === 'object' ? { ...x, source: x.source || p.id } : x)))
    } catch (e) {
      p.lastError = e.message
    }
  }
  return out
}

export const metadata = {
  similarArtists: (artist, prefs) => collect(prefs, 'similarArtists', artist),
  genresOf: async (artist, prefs) => [...new Set(await collect(prefs, 'genresOf', artist))],
  status(prefs) {
    return providers.map((p) => ({ id: p.id, label: p.label, external: p.external, enabled: !!prefs.providers?.[p.id]?.enabled, available: p.available(prefs), note: p.note, lastError: p.lastError || null }))
  }
}
