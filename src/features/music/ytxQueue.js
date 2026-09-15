import { currentTrack, navigateEndpoint, endpoints, playerApi } from '../../registry/music/player.js'
import { blockReason } from './logic/rules.js'
import { music } from './runtime.js'
import { onDispose } from '../../core/lifecycle.js'
import { log } from '../../core/log.js'

// eigene reihenfolge fuer smart radio und mixe
// youtubes warteschlange wird nicht umgebaut, ytx startet am songende einfach den naechsten titel
// youtube spielt dazwischen sein eigenes radio, das faengt ytx am ende wieder ab

const KEY = 'ytx.music.queue'
const listeners = new Set()

let q = load()
let timer = null
let prev = null
let lastJumpAt = 0

function load() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (v && Array.isArray(v.items)) return v
  } catch {}
  return { items: [], index: -1, active: false, title: '', note: '' }
}

function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(q)) } catch {}
  for (const fn of listeners) {
    try { fn(q) } catch {}
  }
}

async function jump(i) {
  const rules = music.rules()
  while (i < q.items.length && blockReason(q.items[i], rules)) i++
  if (i >= q.items.length) {
    q.active = false
    q.note = 'Ende erreicht'
    save()
    stopTimer()
    return false
  }
  q.index = i
  q.note = ''
  lastJumpAt = Date.now()
  save()
  const want = q.items[i].videoId
  const ok = await navigateEndpoint(endpoints.play(want))
  if (!ok) log.warn('ytx queue navigation fehlgeschlagen')
  // ohne vorherige nutzereingabe startet der browser manchmal nicht von selbst
  setTimeout(() => {
    const p = playerApi()
    try {
      if (p && p.getVideoData?.().video_id === want && [-1, 5].includes(p.getPlayerState?.())) p.playVideo?.()
    } catch {}
  }, 3000)
  return ok
}

function tick() {
  if (!q.active) return stopTimer()
  const t = currentTrack()
  if (!t || t.ad) return
  const want = q.items[q.index]
  const now = Date.now()
  if (!want) return
  if (t.videoId === want.videoId || t.counterpartVideoId === want.videoId) {
    // kurz vor ende selbst weiter damit youtube nicht dazwischen funkt
    if (t.playing && t.dur > 5 && t.pos >= t.dur - 1.2 && now - lastJumpAt > 5000) jump(q.index + 1)
  } else if (now - lastJumpAt > 8000) {
    const next = q.items.findIndex((x, i) => i > q.index && (x.videoId === t.videoId || x.videoId === t.counterpartVideoId))
    if (next > 0) {
      q.index = next
      save()
    } else if (prev && (prev.videoId === want.videoId || prev.counterpartVideoId === want.videoId) && prev.dur && prev.pos >= prev.dur - 6) {
      // youtube autoplay war schneller
      jump(q.index + 1)
    } else if (prev && prev.videoId !== t.videoId) {
      q.active = false
      q.note = 'Angehalten, weil du etwas anderes gewählt hast'
      save()
    }
  }
  prev = { videoId: t.videoId, counterpartVideoId: t.counterpartVideoId, pos: t.pos, dur: t.dur }
}

function startTimer() {
  if (!timer) timer = setInterval(tick, 500)
}

function stopTimer() {
  clearInterval(timer)
  timer = null
}

export const ytxQueue = {
  get state() {
    return q
  },
  on(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  async play(items, { start = 0, title = '' } = {}) {
    q = { items: items.map((x) => ({ videoId: x.videoId, title: x.title, artists: x.artists || [], album: x.album || null, durationSec: x.durationSec || null, thumbnail: x.thumbnail || '', reasons: x.reasons || [] })), index: -1, active: true, title, note: '' }
    prev = null
    startTimer()
    return jump(start)
  },
  jumpTo(i) {
    q.active = true
    startTimer()
    return jump(i)
  },
  resume() {
    if (!q.items.length) return
    q.active = true
    q.note = ''
    save()
    startTimer()
  },
  stop() {
    q.active = false
    q.note = 'Gestoppt'
    save()
    stopTimer()
  },
  clear() {
    q = { items: [], index: -1, active: false, title: '', note: '' }
    save()
    stopTimer()
  },
  remaining() {
    return q.items.slice(q.index + 1).reduce((s, x) => s + (x.durationSec || 0), 0)
  }
}

if (q.active) startTimer()
onDispose(stopTimer)
