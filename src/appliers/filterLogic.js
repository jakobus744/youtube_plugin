// reine logik ohne dom, damit sie getestet und spaeter wiederverwendet werden kann

export const REASONS = {
  allowOnly: 'nicht auf Positivliste',
  channel: 'Kanal',
  keyword: 'Stichwort',
  regex: 'Muster',
  short: 'Short',
  live: 'Live',
  tooShort: 'zu kurz',
  tooLong: 'zu lang',
  old: 'zu alt',
  watched: 'gesehen'
}

const norm = (s) => String(s || '').trim().toLowerCase()

// kanal eintraege koennen @handle, UC id oder name sein
function channelMatches(entry, meta) {
  const e = norm(entry)
  if (!e) return false
  if (e.startsWith('uc') && e.length > 20) return norm(meta.channelId) === e || norm(meta.channelUrl).includes(e)
  if (e.startsWith('@')) return norm(meta.channelUrl).replace(/^\//, '') === e || norm(meta.channelUrl).endsWith(`/${e}`)
  return norm(meta.channel) === e
}

export function compileRules(f) {
  const flags = f.title.caseSensitive ? '' : 'i'
  const regex = []
  const errors = []
  for (const r of f.title.regex) {
    try {
      regex.push(new RegExp(r, flags))
    } catch (e) {
      errors.push(`${r}: ${e.message}`)
    }
  }
  const keywords = f.title.caseSensitive ? f.title.keywords : f.title.keywords.map(norm)
  return { f, regex, keywords, errors }
}

export function evaluate(meta, rules) {
  const { f } = rules
  if (!meta) return null
  const isVideo = meta.kind === 'video'
  if (f.channels.allowOnly.length && (meta.channel || meta.channelUrl)) {
    if (!f.channels.allowOnly.some((c) => channelMatches(c, meta))) return REASONS.allowOnly
  }
  if (f.channels.block.some((c) => channelMatches(c, meta))) return REASONS.channel
  const title = f.title.caseSensitive ? meta.title : norm(meta.title)
  if (title) {
    if (rules.keywords.some((k) => k && title.includes(k))) return REASONS.keyword
    if (rules.regex.some((re) => re.test(meta.title))) return REASONS.regex
  }
  if (!isVideo) return null
  if (f.shorts && meta.isShort) return REASONS.short
  if (f.live && meta.live) return REASONS.live
  if (meta.durationSec != null) {
    if (f.duration.minSec != null && meta.durationSec < f.duration.minSec) return REASONS.tooShort
    if (f.duration.maxSec != null && meta.durationSec > f.duration.maxSec) return REASONS.tooLong
  }
  if (f.age.maxDays != null && meta.ageDays != null && meta.ageDays > f.age.maxDays) return REASONS.old
  if (f.watched.hide && meta.percent != null && meta.percent >= f.watched.minPercent) return REASONS.watched
  return null
}
