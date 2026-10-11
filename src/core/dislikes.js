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
