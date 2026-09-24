// schauzeit auswerten, reine logik

export const DAY = 24 * 3600 * 1000

export function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// laufende sitzung, zaehlt echte zeit solange ein video spielt
export function createSession(p, now) {
  return { id: `${now}-${p.videoId}`, videoId: p.videoId, kind: p.kind, title: p.title, channel: p.channel, startedAt: now, endedAt: now, day: dayKey(now), wallSec: 0, maxPos: 0, durationSec: Math.round(p.dur || 0) }
}

export function tickSession(s, p, dtSec, now) {
  if (p.playing && !p.ad) s.wallSec += dtSec
  s.maxPos = Math.max(s.maxPos, p.pos || 0)
  if (p.dur) s.durationSec = Math.round(p.dur)
  if (!s.title && p.title) s.title = p.title
  if (!s.channel?.name && p.channel?.name) s.channel = p.channel
  s.endedAt = now
  s.percent = s.durationSec ? Math.min(1, s.maxPos / s.durationSec) : null
  return s
}

// erinnerungen: tageslimit einmal, danach im abstand, pause nach laengerem schauen am stueck
export function reminderDue({ todaySec, streakSec, limitMin, breakMin, remindEveryMin, state }) {
  if (limitMin > 0 && todaySec >= limitMin * 60) {
    const next = state.limitAt == null ? limitMin * 60 : state.limitAt + Math.max(1, remindEveryMin) * 60
    if (todaySec >= next) return { kind: 'limit', mark: todaySec }
  }
  if (breakMin > 0 && streakSec >= breakMin * 60 && (state.breakAt == null || streakSec >= state.breakAt + breakMin * 60)) return { kind: 'break', mark: streakSec }
  return null
}

function add(map, key, init, sec) {
  const v = map.get(key) || { ...init, sec: 0, count: 0 }
  v.sec += sec
  v.count++
  map.set(key, v)
}

export function watchStats(views, { from, to, now = Date.now(), days = 7, limit = 10 }) {
  const list = views.filter((v) => v.startedAt >= from && v.startedAt < to && v.wallSec > 0)
  const byDay = new Map()
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(startOfDay(now) - i * DAY), 0)
  const channels = new Map()
  const videos = new Map()
  let total = 0
  let shorts = 0
  for (const v of list) {
    total += v.wallSec
    if (v.kind === 'short') shorts += v.wallSec
    if (byDay.has(v.day)) byDay.set(v.day, byDay.get(v.day) + v.wallSec)
    const ck = v.channel?.id || v.channel?.name || '?'
    add(channels, ck, { name: v.channel?.name || 'Unbekannt', id: v.channel?.id || null }, v.wallSec)
    add(videos, v.videoId, { videoId: v.videoId, title: v.title, channel: v.channel?.name || '', kind: v.kind }, v.wallSec)
  }
  const top = (m) => [...m.values()].sort((a, b) => b.sec - a.sec).slice(0, limit)
  const activeDays = [...byDay.values()].filter((x) => x > 0).length
  return {
    total,
    shorts,
    videos: videos.size,
    avgPerDay: days ? total / days : 0,
    activeDays,
    byDay: [...byDay.entries()].map(([day, sec]) => ({ day, sec })),
    topChannels: top(channels),
    topVideos: top(videos)
  }
}
