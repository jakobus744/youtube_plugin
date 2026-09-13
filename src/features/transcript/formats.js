import { clock, subtitleTime, formatDate } from '../../core/format.js'

// json3 events in segmente
export function parseJson3(json) {
  const segs = []
  for (const ev of json.events || []) {
    if (!ev.segs) continue
    const raw = ev.segs.map((s) => s.utf8 || '').join('')
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const startMs = ev.tStartMs || 0
    segs.push({ startMs, endMs: startMs + (ev.dDurationMs || 0), text })
  }
  segs.sort((a, b) => a.startMs - b.startMs)
  // automatische spuren ueberlappen, ende auf naechsten start kappen
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i].endMs > segs[i + 1].startMs) segs[i].endMs = Math.max(segs[i].startMs, segs[i + 1].startMs)
  }
  const out = []
  for (const s of segs) {
    const prev = out[out.length - 1]
    if (prev && prev.text === s.text && s.startMs - prev.endMs < 1500) {
      prev.endMs = s.endMs
      continue
    }
    out.push(s)
  }
  return out
}

const TAG_RE = /\[(?:musik|music|applaus|applause|gelächter|laughter|lachen|geräusche|noise|__)\]|\((?:musik|music|applaus|applause)\)|♪+/gi

export function cleanSegments(segs, { stripTags = true, speakerHeuristic = true } = {}) {
  const out = []
  for (const s of segs) {
    let text = s.text
    let speaker = false
    if (speakerHeuristic && /^(>>|&gt;&gt;|- )/.test(text)) {
      speaker = true
      text = text.replace(/^(>>|&gt;&gt;|- )\s*/, '')
    }
    if (stripTags) text = text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    out.push({ ...s, text, speaker })
  }
  return out
}

const SENTENCE_END = /[.!?…:;"“”)]$/

export function toParagraphs(segs, { mode = 'pause', pauseMs = 1500, chapters = [], maxChars = 900 } = {}) {
  const useChapters = mode === 'chapters' && chapters.length > 1
  const splitPause = mode !== 'none'
  const paras = []
  let cur = null
  let chIdx = -1
  const chapterFor = (ms) => {
    let idx = -1
    for (let i = 0; i < chapters.length; i++) if (chapters[i].startSec * 1000 <= ms + 500) idx = i
    return idx
  }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const prev = segs[i - 1]
    let title = null
    if (useChapters) {
      const idx = chapterFor(s.startMs)
      if (idx !== chIdx) {
        chIdx = idx
        if (idx >= 0) title = chapters[idx].title
      }
    }
    const gap = prev ? s.startMs - prev.endMs : 0
    const long = cur && cur.chars > maxChars && SENTENCE_END.test(prev?.text || '')
    const brk = !cur || title !== null || s.speaker || (splitPause && (gap >= pauseMs || long))
    if (brk) {
      cur = { startMs: s.startMs, title, segs: [], chars: 0 }
      paras.push(cur)
    }
    cur.segs.push(s)
    cur.chars += s.text.length + 1
  }
  return paras
}

export function stats(segs) {
  const words = segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0)
  return { words, readingMin: Math.max(1, Math.round(words / 230)) }
}

const joinText = (segs) => segs.map((s) => s.text).join(' ').replace(/\s+([,.!?;:])/g, '$1')

export function videoLink(videoId, sec) {
  return `https://www.youtube.com/watch?v=${videoId}${sec ? `&t=${Math.floor(sec)}s` : ''}`
}

function mdHeader(meta) {
  const lines = [`# ${meta.title}`, '']
  if (meta.author) lines.push(`- **Kanal:** ${meta.channelUrl ? `[${meta.author}](${meta.channelUrl})` : meta.author}`)
  lines.push(`- **Video:** ${videoLink(meta.videoId)}`)
  if (meta.publishDate) lines.push(`- **Veröffentlicht:** ${formatDate(meta.publishDate)}`)
  if (meta.durationSec) lines.push(`- **Länge:** ${clock(meta.durationSec)}`)
  if (meta.trackLabel) lines.push(`- **Transkript:** ${meta.trackLabel}`)
  lines.push('')
  return lines.join('\n')
}

function textHeader(meta) {
  return [meta.title, [meta.author, videoLink(meta.videoId)].filter(Boolean).join(' – '), meta.trackLabel ? `Transkript: ${meta.trackLabel}` : '', ''].filter((x, i) => x || i === 3).join('\n')
}

// format: plain | timestamps | markdown | srt | vtt
export function render(format, { meta, segs, paras }, { header = true, timestampEvery = 'paragraph' } = {}) {
  if (format === 'srt') {
    return segs.map((s, i) => `${i + 1}\n${subtitleTime(s.startMs, ',')} --> ${subtitleTime(Math.max(s.endMs, s.startMs + 500), ',')}\n${s.text}\n`).join('\n')
  }
  if (format === 'vtt') {
    return `WEBVTT\n\n${segs.map((s) => `${subtitleTime(s.startMs, '.')} --> ${subtitleTime(Math.max(s.endMs, s.startMs + 500), '.')}\n${s.text}\n`).join('\n')}`
  }
  const out = []
  if (format === 'markdown') {
    if (header) out.push(mdHeader(meta))
    for (const p of paras) {
      if (p.title) out.push(`## [${p.title}](${videoLink(meta.videoId, p.startMs / 1000)})`, '')
      if (timestampEvery === 'segment') {
        out.push(p.segs.map((s) => `[${clock(s.startMs / 1000)}](${videoLink(meta.videoId, s.startMs / 1000)}) ${s.text}`).join('  \n'), '')
      } else {
        out.push(`[${clock(p.startMs / 1000)}](${videoLink(meta.videoId, p.startMs / 1000)}) ${joinText(p.segs)}`, '')
      }
    }
    return out.join('\n').trim() + '\n'
  }
  if (header) out.push(textHeader(meta))
  for (const p of paras) {
    if (p.title) out.push(format === 'timestamps' ? `[${clock(p.startMs / 1000)}] ${p.title}` : p.title, '')
    if (format === 'timestamps') {
      if (timestampEvery === 'segment') out.push(p.segs.map((s) => `[${clock(s.startMs / 1000)}] ${s.text}`).join('\n'), '')
      else out.push(`[${clock(p.startMs / 1000)}] ${joinText(p.segs)}`, '')
    } else {
      out.push(joinText(p.segs), '')
    }
  }
  return out.join('\n').trim() + '\n'
}

export const FORMAT_LABELS = {
  plain: 'Nur Text',
  timestamps: 'Text mit Zeitstempeln',
  markdown: 'Markdown mit Zeitlinks',
  srt: 'SRT-Untertitel',
  vtt: 'WebVTT-Untertitel'
}
