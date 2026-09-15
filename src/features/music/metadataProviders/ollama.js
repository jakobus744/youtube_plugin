import { gmJson, hasGmRequest } from './http.js'

// lokales sprachmodell ueber ollama, nur fuer genre schaetzung
export const ollamaProvider = {
  id: 'ollama',
  label: 'Ollama (lokales Modell)',
  external: true,
  note: 'Läuft auf deinem Rechner. Schätzt Genres, kann sich irren',
  available: (prefs) => hasGmRequest() && !!prefs?.providers?.ollama?.model,
  async genresOf(artist, prefs) {
    const { url, model } = prefs.providers.ollama
    const prompt = `Nenne bis zu 3 Musikgenres für den Künstler "${artist.name}". Antworte nur mit einer JSON-Liste von Strings.`
    const r = await gmJson(`${url.replace(/\/$/, '')}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: false, format: 'json' }), timeout: 30000 })
    try {
      const v = JSON.parse(r?.response || '[]')
      const list = Array.isArray(v) ? v : Object.values(v).flat()
      return list.filter((x) => typeof x === 'string').slice(0, 3)
    } catch {
      return []
    }
  }
}
