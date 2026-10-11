// teilen ohne Tracking Anhang: reine Logik ohne dom, damit sie getestet werden kann
// youtube haengt si= (Tracking der Weitergabe), pp= und feature= an Links, der Empfaenger braucht sie nicht

const DROP = ['si', 'pp', 'feature', 'ab_channel', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
const HOST = /^(?:youtu\.be|(?:www\.|m\.|music\.)?youtube\.com|youtube-nocookie\.com)$/i
const URL_RE = /https?:\/\/[^\s<>"']+/g

// ein Link, nur YouTube Links werden angefasst, der Zeitpunkt (t=) und die Playlist bleiben
export function cleanShareUrl(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    return String(url)
  }
  if (!HOST.test(u.hostname)) return String(url)
  let changed = false
  for (const k of DROP) {
    if (u.searchParams.has(k)) {
      u.searchParams.delete(k)
      changed = true
    }
  }
  return changed ? u.href : String(url)
}

// ein Text mit Links darin (z. B. der Teilen Text einer App)
export function cleanShareText(text) {
  if (text == null) return text
  return String(text).replace(URL_RE, (m) => {
    // Satzzeichen am Ende gehoeren nicht zum Link
    const tail = (m.match(/[.,;:!?)]+$/) || [''])[0]
    const body = tail ? m.slice(0, -tail.length) : m
    return cleanShareUrl(body) + tail
  })
}
