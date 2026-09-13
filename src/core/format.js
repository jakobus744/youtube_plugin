// dauer text wie 1:02:03 in sekunden
export function parseDuration(text) {
  if (text == null) return null
  if (typeof text === 'number') return text
  const m = String(text).trim().match(/(\d+(?::\d{1,2}){1,2})/)
  if (!m) return null
  let s = 0
  for (const p of m[1].split(':').map(Number)) s = s * 60 + p
  return s
}

export function formatDuration(sec, { long = 'hours' } = {}) {
  if (sec == null || !isFinite(sec)) return '–'
  sec = Math.max(0, Math.round(sec))
  if (sec === 0) return '0 min'
  if (sec < 60) return '< 1 min'
  let m = Math.floor(sec / 60)
  let h = Math.floor(m / 60)
  m %= 60
  if (long === 'days' && h >= 24) {
    const d = Math.floor(h / 24)
    h %= 24
    return [`${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')
  }
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export function clock(sec) {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function subtitleTime(ms, sep) {
  ms = Math.max(0, Math.round(ms))
  const pad = (n, l = 2) => String(n).padStart(l, '0')
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`
}

export function firstInt(text) {
  const m = String(text ?? '').match(/\d[\d.,\s]*/)
  if (!m) return null
  const n = Number(m[0].replace(/[^\d]/g, ''))
  return isFinite(n) ? n : null
}

const AGE_UNITS = [
  [/(sekunde|second)/i, 1 / 86400],
  [/(minute)/i, 1 / 1440],
  [/(stunde|hour)/i, 1 / 24],
  [/(tag|day)/i, 1],
  [/(woche|week)/i, 7],
  [/(monat|month)/i, 30],
  [/(jahr|year)/i, 365]
]

// relative angaben wie vor 3 jahren oder 2 weeks ago in tagen
export function parseAgeDays(text) {
  if (!text) return null
  const s = String(text)
  if (!/(vor |ago)/i.test(s)) return null
  const n = firstInt(s) ?? 1
  for (const [re, f] of AGE_UNITS) if (re.test(s)) return n * f
  return null
}

export function formatDate(iso, withTime = false) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const opts = { day: '2-digit', month: '2-digit', year: 'numeric' }
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleString('de-DE', opts)
}

export function formatTimeOfDay(date) {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}
