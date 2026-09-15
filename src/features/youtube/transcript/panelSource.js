import { dataOf, runsText } from '../../../core/bridge.js'
import { qs, qsa } from '../../../core/dom.js'
import { waitFor, sleep } from '../../../core/scheduler.js'

// fallback quelle ueber youtubes eigenes transkript panel
// panel laedt ueber get_transcript, das kann youtube je nach sitzung blockieren

const PANEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
const OPENER = 'ytd-watch-metadata ytd-video-description-transcript-section-renderer button'
const SEGMENTS = 'ytd-transcript-segment-renderer, transcript-segment-view-model'

function readSegments() {
  const out = []
  for (const el of qsa(SEGMENTS)) {
    const d = dataOf(el)
    let startMs = Number(d?.startMs)
    let endMs = Number(d?.endMs)
    let text = runsText(d?.snippet)
    if (!text) text = (qs('.segment-text, yt-formatted-string:not(.segment-timestamp), [class*="SegmentText"]', el) || el).textContent || ''
    if (!isFinite(startMs)) {
      const ts = qs('.segment-timestamp, [class*="Timestamp"]', el)?.textContent || ''
      const parts = ts.trim().split(':').map(Number)
      startMs = parts.every(isFinite) ? parts.reduce((a, b) => a * 60 + b, 0) * 1000 : NaN
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (!text || !isFinite(startMs)) continue
    out.push({ startMs, endMs: isFinite(endMs) ? endMs : startMs, text })
  }
  return out
}

export async function transcriptFromPanel() {
  const panels = qsa(PANEL)
  const openBefore = panels.find((p) => p.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED')
  let opened = false
  if (!openBefore) {
    const opener = qs(OPENER)
    if (!opener) return null
    // panel waehrend des ladens unsichtbar halten
    document.documentElement.setAttribute('data-ytx-hide-transcript-panel', '')
    opener.click()
    opened = true
  }
  try {
    const first = await waitFor(() => qsa(SEGMENTS).length || null, { timeout: 9000, interval: 200 })
    if (!first) return null
    // warten bis die anzahl stabil ist
    let last = -1
    for (let i = 0; i < 10; i++) {
      const n = qsa(SEGMENTS).length
      if (n === last) break
      last = n
      await sleep(250)
    }
    const segs = readSegments()
    return segs.length ? { events: segs.map((s) => ({ tStartMs: s.startMs, dDurationMs: Math.max(0, s.endMs - s.startMs), segs: [{ utf8: s.text }] })) } : null
  } finally {
    if (opened) {
      const p = qsa(PANEL).find((x) => x.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED')
      qs('#visibility-button button, #visibility-button yt-button-shape button', p || document)?.click()
      setTimeout(() => document.documentElement.removeAttribute('data-ytx-hide-transcript-panel'), 300)
    }
  }
}

export const PANEL_HIDE_CSS = `html[data-ytx-hide-transcript-panel] ${PANEL} { position: absolute !important; left: -99999px !important; }`
