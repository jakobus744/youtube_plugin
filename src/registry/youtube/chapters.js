// kapitel aus der beschreibung wie youtube sie bildet
// zeitstempel pro zeile, erster bei 0:00, mindestens drei

const STAMP = /(?:^|\s|\()((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|\s|\)|[-–:|.,])/

function toSec(stamp) {
  return stamp.split(':').map(Number).reduce((a, b) => a * 60 + b, 0)
}

export function chaptersFromDescription(text) {
  const out = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    const m = line.match(STAMP)
    if (!m) continue
    const sec = toSec(m[1])
    const title = line
      .replace(m[1], '')
      .replace(/^[\s\-–:|.()]+|[\s\-–:|()]+$/g, '')
      .trim()
    if (out.length && sec <= out[out.length - 1].startSec) continue
    out.push({ title: title || m[1], startSec: sec })
  }
  if (out.length < 3 || out[0].startSec !== 0) return []
  return out
}
