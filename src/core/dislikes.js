// Dislike Anzahl von Return YouTube Dislike, reine Logik ohne dom
export const API = 'https://returnyoutubedislikeapi.com/votes?videoId='

// Antwort des Dienstes, nur plausible Zahlen
export function parseVotes(j) {
  if (!j || typeof j !== 'object') return null
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null)
  const dislikes = n(j.dislikes)
  if (dislikes == null) return null
  return { likes: n(j.likes), dislikes }
}

// 1234 -> "1,2 Tsd." (Sprache des Browsers)
export function formatCount(n, locale) {
  try {
    return new Intl.NumberFormat(locale || undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
  } catch {
    return String(n)
  }
}

// Zahl aus der Beschriftung des Like Knopfs, z. B. "Dieses Video liken (bisher 20.052.981 positive Bewertungen)"
// die Schreibweise der Tausender (Punkt, Komma, Leerzeichen) ist egal, die laengste Ziffernfolge zaehlt
export function likesFromLabel(label) {
  const m = String(label || '').match(/\d[\d.,\s  ]*\d|\d/g)
  if (!m) return null
  const best = m.map((x) => x.replace(/\D/g, '')).sort((a, b) => b.length - a.length)[0]
  const n = Number(best)
  return Number.isFinite(n) ? n : null
}

// Anzeige nach einem Druck auf den Knopf: YouTube aktualisiert Beschriftung bzw. Dienst nicht sofort
// base = Zahl beim ersten Lesen, now = Zahl jetzt, pressed0/pressedNow = Zustand des Knopfs beim ersten Lesen und jetzt
// aendert sich die Quelle nicht, zaehlt die Aenderung des Knopfs um eins hinzu
export function adjustCount(base, now, pressed0, pressedNow) {
  if (base == null || now == null) return now
  if (now !== base) return now
  return Math.max(0, now + (pressedNow ? 1 : 0) - (pressed0 ? 1 : 0))
}

// gedrueckt: aria-pressed am Knopf oder am umgebenden Schalter
export function isPressed(btn) {
  const el = btn?.closest?.('[aria-pressed]') || btn
  return el?.getAttribute?.('aria-pressed') === 'true'
}
