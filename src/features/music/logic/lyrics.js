// songtexte formatieren, reine logik

export const LYRICS_FORMATS = [
  ['plain', 'Nur Text'],
  ['header', 'Mit Titel und Künstler'],
  ['timestamps', 'Mit Zeitstempeln'],
  ['lrc', 'LRC-Datei']
]

function stamp(ms, lrc) {
  const total = Math.max(0, Math.floor(ms / 10))
  const cs = total % 100
  const s = Math.floor(total / 100) % 60
  const m = Math.floor(total / 6000)
  return lrc ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function formatLyrics(data, { mode = 'plain', meta = {} } = {}) {
  if (!data?.available || !data.lines?.length) return ''
  const lines = data.lines.map((l) => ({ text: String(l.text ?? '').replace(/\s+$/, ''), startMs: l.startMs }))
  const who = (meta.artists || []).map((a) => a.name).join(', ')
  if (mode === 'lrc') {
    const head = [meta.title && `[ti:${meta.title}]`, who && `[ar:${who}]`, meta.album?.name && `[al:${meta.album.name}]`].filter(Boolean)
    const body = data.timed ? lines.map((l) => `[${stamp(l.startMs || 0, true)}]${l.text}`) : lines.map((l) => l.text)
    return [...head, ...body].join('\n')
  }
  if (mode === 'timestamps' && data.timed) return lines.map((l) => `[${stamp(l.startMs || 0, false)}] ${l.text}`).join('\n')
  const text = lines.map((l) => l.text).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (mode === 'header') return [`${meta.title || ''}${who ? ` – ${who}` : ''}`.trim(), '', text, data.source ? `\n${data.source}` : ''].join('\n').trim()
  return text
}
