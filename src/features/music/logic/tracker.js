import { artistKey } from './versions.js'

// macht aus player stichproben einzelne hoer eintraege
// reine logik ohne dom, zeit kommt aus den stichproben

export const TRACKER_DEFAULTS = {
  completePct: 0.9,
  endSlackSec: 8,
  minSamples: 2,
  repeatWindowMs: 15 * 60 * 1000,
  quickSkipSec: 10
}

export function createTracker(options = {}) {
  const o = { ...TRACKER_DEFAULTS, ...options }
  let cur = null
  let last = null

  function start(s) {
    cur = {
      videoId: s.videoId,
      meta: s.meta || null,
      startedAt: s.ts,
      lastTs: s.ts,
      lastPos: s.pos || 0,
      maxPos: s.pos || 0,
      listened: 0,
      duration: s.dur || 0,
      samples: 1,
      liked: !!s.liked,
      repeat: !!(last && last.videoId === s.videoId && s.ts - last.endedAt < o.repeatWindowMs),
      context: s.context || null
    }
  }

  function finalize(reason, ts) {
    if (!cur) return null
    const c = cur
    cur = null
    const dur = c.duration || c.meta?.durationSec || 0
    if (c.samples < o.minSamples && c.listened < 1) return null
    const pct = dur ? Math.min(1, c.listened / dur) : 0
    const reachedEnd = dur ? c.maxPos >= dur - o.endSlackSec : false
    const completed = pct >= o.completePct || (reachedEnd && pct >= 0.5) || reason === 'ended'
    const skipped = !completed && (reason === 'change' || reason === 'skip')
    const meta = c.meta || {}
    const rec = {
      id: `${c.startedAt}-${c.videoId}`,
      videoId: c.videoId,
      title: meta.title || '',
      artists: meta.artists || [],
      artistKeys: (meta.artists || []).map(artistKey).filter(Boolean),
      album: meta.album || null,
      year: meta.year ?? null,
      startedAt: c.startedAt,
      endedAt: ts,
      listenedSec: Math.round(c.listened * 10) / 10,
      durationSec: dur ? Math.round(dur) : null,
      percent: Math.round(pct * 1000) / 1000,
      completed,
      skipped,
      quickSkip: skipped && c.listened < o.quickSkipSec,
      skipAtSec: skipped ? Math.round(c.lastPos) : null,
      skipAtPct: skipped && dur ? Math.round((c.lastPos / dur) * 1000) / 1000 : null,
      repeat: c.repeat,
      liked: c.liked,
      reason,
      context: c.context
    }
    last = { videoId: rec.videoId, endedAt: ts }
    return rec
  }

  return {
    get current() {
      return cur
    },

    // s = { ts, videoId, pos, dur, playing, ad, liked, rate, meta, context }
    sample(s) {
      const out = []
      if (!s || !s.videoId || s.ad) return out
      if (cur && cur.videoId !== s.videoId) {
        const r = finalize('change', s.ts)
        if (r) out.push(r)
      }
      if (!cur) {
        start(s)
        return out
      }
      // loop ohne songwechsel, zurueck an den anfang nachdem das ende erreicht war
      if (cur.duration && s.pos < 3 && cur.maxPos >= cur.duration - o.endSlackSec && s.playing) {
        const r = finalize('ended', s.ts)
        if (r) out.push(r)
        last = { videoId: s.videoId, endedAt: s.ts }
        start(s)
        return out
      }
      const wall = Math.max(0, (s.ts - cur.lastTs) / 1000)
      const allowed = wall * (s.rate || 1) + 2
      const delta = s.pos - cur.lastPos
      if (s.playing && delta > 0 && delta <= allowed) cur.listened += delta
      cur.lastPos = s.pos
      cur.lastTs = s.ts
      cur.maxPos = Math.max(cur.maxPos, s.pos)
      cur.samples++
      if (s.dur) cur.duration = s.dur
      if (s.liked) cur.liked = true
      if (s.meta && (!cur.meta || !cur.meta.artists?.length)) cur.meta = s.meta
      return out
    },

    // ende des songs laut player, seitenwechsel oder schliessen
    finish(reason, ts) {
      const r = finalize(reason, ts)
      return r ? [r] : []
    }
  }
}
