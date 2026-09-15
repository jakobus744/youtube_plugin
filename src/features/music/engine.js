import { catalog, loader } from './data/catalog.js'
import { music } from './runtime.js'
import { rank, discoveryValue } from './logic/recommend.js'
import { artistKey } from './logic/versions.js'
import { matchMood, presetById } from './logic/sessions.js'
import { DAY } from './logic/taste.js'
import { metadata } from './metadataProviders/index.js'
import { log } from '../../core/log.js'

// baut mixe aus lokalem profil und youtube music seiten
// jede quelle begruendet ihre kandidaten, rank entscheidet und erklaert

export { MIXES } from './mixes.js'

function toCandidate(t, source) {
  if (!t?.videoId) return null
  return { videoId: t.videoId, title: t.title, artists: t.artists || [], album: t.album || null, year: t.year ?? null, durationSec: t.durationSec || null, thumbnail: t.thumbnail || '', videoType: t.videoType || null, sources: [source] }
}

// begrenzt neue netzwerkanfragen pro mix, alles aus dem cache ist frei
function budget(max, report) {
  const start = loader.stats.requests
  const errors = []
  return {
    errors,
    get used() {
      return loader.stats.requests - start
    },
    async get(fn) {
      const over = loader.stats.requests - start >= max
      try {
        return await fn(over ? { cacheOnly: true } : {})
      } catch (e) {
        if (!/nicht im cache/.test(e.message)) errors.push(e.message)
        return null
      } finally {
        report?.(loader.stats.requests - start, max)
      }
    }
  }
}

function rankOptions(prefs, eff, overrides = {}) {
  return {
    discovery: overrides.discovery ?? eff.discovery,
    rules: music.rules(),
    excluded: prefs.excluded,
    hideVersions: prefs.hideVersions,
    onlyKnownArtists: overrides.onlyKnownArtists ?? eff.onlyKnownArtists,
    limit: overrides.limit ?? 40,
    maxPerArtist: overrides.maxPerArtist,
    excludeIds: overrides.excludeIds
  }
}

async function seedArtists(profile, max = 8) {
  const favs = (await music.favorites.byType('artist')).sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
  const out = []
  const seen = new Set()
  for (const f of favs) {
    if (!f.id || seen.has(f.id)) continue
    seen.add(f.id)
    out.push({ id: f.id, name: f.name, key: f.id, kind: 'favoriteArtist' })
  }
  for (const a of profile.topArtists(30)) {
    if (!a.id || seen.has(a.id) || a.feedback < 0) continue
    seen.add(a.id)
    out.push({ id: a.id, name: a.name, key: a.key, kind: 'topArtist' })
  }
  return out.slice(0, max)
}

function recentIds(profile, hours) {
  const since = Date.now() - hours * 3600 * 1000
  return new Set([...profile.songs.values()].filter((s) => s.lastPlayed > since).map((s) => s.videoId))
}

// ---------- einzelne mixe ----------

async function forYou(ctx) {
  const { profile, b } = ctx
  const cands = []
  const seeds = await seedArtists(profile, 8)
  const similarSeen = new Set(seeds.map((s) => s.id))
  let similarCount = 0
  for (const seed of seeds) {
    const page = await b.get((o) => catalog.artist(seed.id, o))
    if (!page) continue
    for (const t of page.topSongs.slice(0, 6)) cands.push(toCandidate(t, { kind: seed.kind, via: seed.name, viaKey: seed.key }))
    for (const sim of page.similar.slice(0, 3)) {
      if (similarCount >= 6 || similarSeen.has(sim.id)) continue
      similarSeen.add(sim.id)
      similarCount++
      const sp = await b.get((o) => catalog.artist(sim.id, o))
      for (const t of sp?.topSongs.slice(0, 4) || []) cands.push(toCandidate(t, { kind: 'similar', via: seed.name, viaKey: seed.key }))
    }
  }
  // zu hoeren in: redaktionelle playlists der ersten favoriten
  for (const seed of seeds.slice(0, 2)) {
    const page = await b.get((o) => catalog.artist(seed.id, o))
    const pl = page?.featuredOn?.[0]
    if (!pl) continue
    const col = await b.get((o) => catalog.playlist(pl.id, o))
    for (const t of col?.tracks.slice(0, 12) || []) cands.push(toCandidate(t, { kind: 'featured', via: seed.name, viaKey: seed.key }))
  }
  for (const s of await music.favorites.byType('song')) cands.push(toCandidate({ videoId: s.id, title: s.name, artists: s.artists }, { kind: 'seed', via: 'deinen Lieblingssongs', weight: 0.9 }))
  const old = Date.now() - 45 * DAY
  for (const s of profile.topSongs(40)) if (s.lastPlayed && s.lastPlayed < old) cands.push(toCandidate(s, { kind: 'history' }))
  return { candidates: cands.filter(Boolean), excludeIds: recentIds(profile, 2) }
}

async function releasesMix(ctx) {
  const { b } = ctx
  const list = (await music.releases.latest(60)).filter((r) => r.fresh || r.recent)
  const cands = []
  for (const r of list.slice(0, 10)) {
    const col = await b.get((o) => catalog.album(r.id, o))
    for (const t of col?.tracks.slice(0, r.kind && /single|ep/i.test(r.kind) ? 3 : 4) || []) cands.push(toCandidate(t, { kind: 'release', via: r.artistName, viaKey: r.artistId }))
  }
  return { candidates: cands.filter(Boolean), releases: list, overrides: { discovery: 0.5, maxPerArtist: 4 } }
}

async function genreMix(ctx, { genre }) {
  const { b, profile } = ctx
  if (!genre) throw new Error('kein Genre gewählt')
  const cands = []
  const res = await b.get((o) => catalog.search(genre, o))
  if (!res) return { candidates: [] }
  for (const t of res.songs.slice(0, 20)) cands.push(toCandidate(t, { kind: 'genre', genre }))
  for (const pl of res.playlists.filter((p) => p.editorial !== false).slice(0, 2)) {
    const col = await b.get((o) => catalog.playlist(pl.id, o))
    for (const t of col?.tracks.slice(0, 25) || []) cands.push(toCandidate(t, { kind: 'genre', genre }))
  }
  // kuenstler aus dem genre die du schon kennst zuerst ausbauen
  const artists = res.artists.slice(0, 6).sort((a, c) => profile.artistAffinity(artistKey(c)) - profile.artistAffinity(artistKey(a)))
  for (const a of artists.slice(0, 3)) {
    const page = await b.get((o) => catalog.artist(a.id, o))
    for (const t of page?.topSongs.slice(0, 4) || []) cands.push(toCandidate(t, { kind: 'genre', genre, viaKey: a.id }))
  }
  return { candidates: cands.filter(Boolean) }
}

async function longAgo(ctx) {
  const old = Date.now() - 45 * DAY
  const cands = ctx.profile
    .topSongs(300)
    .filter((s) => s.lastPlayed && s.lastPlayed < old && s.completes > 0)
    .map((s) => toCandidate(s, { kind: 'history' }))
  return { candidates: cands.filter(Boolean), overrides: { discovery: 0.1, maxPerArtist: 3 } }
}

async function neverHeard(ctx) {
  const base = await forYou(ctx)
  const p = ctx.profile
  const cands = base.candidates.filter((c) => !p.songPlays(c.videoId) && !(c.artists || []).some((a) => p.artistPlays(artistKey(a)) > 0))
  return { candidates: cands, overrides: { discovery: 0.95 } }
}

async function similarMix(ctx, { artist }) {
  const { b } = ctx
  if (!artist?.id) throw new Error('kein Künstler')
  const page = await b.get((o) => catalog.artist(artist.id, o))
  const cands = []
  const similar = [...(page?.similar || [])]
  const prefs = music.prefs()
  for (const extra of await metadata.similarArtists(artist, prefs).catch(() => [])) {
    if (extra.source === 'local' || similar.some((s) => s.name.toLowerCase() === extra.name.toLowerCase())) continue
    similar.push({ id: extra.id, name: extra.name, external: extra.source })
  }
  for (const sim of similar.slice(0, 8)) {
    let id = sim.id
    if (!id) {
      const r = await b.get((o) => catalog.search(sim.name, o))
      id = r?.artists?.find((a) => a.name.toLowerCase() === sim.name.toLowerCase())?.id
    }
    if (!id) continue
    const sp = await b.get((o) => catalog.artist(id, o))
    for (const t of sp?.topSongs.slice(0, 4) || []) cands.push(toCandidate(t, { kind: 'similar', via: page?.name || artist.name, viaKey: artist.id }))
  }
  return { candidates: cands.filter(Boolean), overrides: { maxPerArtist: 3 } }
}

async function moreFrom(ctx, { artist }) {
  const { b, profile } = ctx
  if (!artist?.id) throw new Error('kein Künstler')
  const page = await b.get((o) => catalog.artist(artist.id, o))
  if (!page) return { candidates: [] }
  const cands = page.topSongs.map((t) => toCandidate(t, { kind: 'seed', via: page.name, viaKey: artist.id }))
  for (const r of page.releases.slice(0, 4)) {
    const col = await b.get((o) => catalog.album(r.id, o))
    for (const t of col?.tracks || []) cands.push(toCandidate(t, { kind: 'seed', via: page.name, viaKey: artist.id, weight: 0.8 }))
  }
  return { candidates: cands.filter(Boolean), excludeIds: recentIds(profile, 3), overrides: { maxPerArtist: 50, discovery: 0.5 } }
}

async function moodMix(ctx, { presetId, mood }) {
  const { b } = ctx
  let name = mood
  if (!name && presetId) {
    const moods = await b.get((o) => catalog.moods(o))
    name = matchMood([...(moods?.moods || []), ...(moods?.genres || [])], presetById[presetId]?.moods)?.name
  }
  if (!name) return { candidates: [] }
  const res = await b.get((o) => catalog.search(name, o))
  const cands = []
  for (const pl of (res?.playlists || []).slice(0, 3)) {
    const col = await b.get((o) => catalog.playlist(pl.id, o))
    for (const t of col?.tracks.slice(0, 25) || []) cands.push(toCandidate(t, { kind: 'genre', genre: name }))
  }
  return { candidates: cands.filter(Boolean) }
}

async function radio(ctx, { seed }) {
  if (!seed) throw new Error('kein Startpunkt')
  if (seed.type === 'genre') return genreMix(ctx, { genre: seed.name })
  if (seed.type === 'mood') return moodMix(ctx, { mood: seed.name, presetId: seed.presetId })
  const artist = seed.type === 'artist' ? seed : seed.artists?.find((a) => a.id)
  const cands = []
  if (artist) {
    // eigene songs des startkuenstlers nur als teil des radios, aehnliche kuenstler tragen den rest
    const own = await moreFrom(ctx, { artist })
    for (const c of own.candidates.slice(0, 12)) cands.push({ ...c, sources: c.sources.map((s) => ({ ...s, weight: 0.7 })) })
    cands.push(...(await similarMix(ctx, { artist })).candidates)
  }
  if (seed.type === 'song') cands.unshift(toCandidate(seed, { kind: 'seed', via: seed.title, weight: 2 }))
  return { candidates: cands.filter(Boolean), overrides: { maxPerArtist: 3 }, interleave: true }
}

// gleiche kuenstler nicht direkt hintereinander, reihenfolge sonst nach score
export function spreadArtists(list) {
  const rest = list.slice()
  const out = []
  let prev = null
  while (rest.length) {
    let i = rest.findIndex((x) => artistKey(x.artists?.[0]) !== prev)
    if (i < 0) i = 0
    const [x] = rest.splice(i, 1)
    prev = artistKey(x.artists?.[0])
    out.push(x)
  }
  return out
}

const BUILDERS = { forYou, releases: releasesMix, genre: genreMix, longAgo, neverHeard, similar: similarMix, moreFrom, radio, mood: moodMix }

export async function buildMix(kind, args = {}, { maxRequests = 12, onProgress, limit = 40 } = {}) {
  const fn = BUILDERS[kind]
  if (!fn) throw new Error(`unbekannter Mix ${kind}`)
  const t0 = Date.now()
  const profile = await music.profile()
  const prefs = music.prefs()
  const eff = music.effective()
  const b = budget(maxRequests, onProgress)
  let res
  try {
    res = await fn({ profile, prefs, eff, b }, args)
  } catch (e) {
    log.warn(`mix ${kind}`, e)
    return { kind, items: [], error: e.message, errors: b.errors, requests: b.used, ms: Date.now() - t0 }
  }
  const opts = rankOptions(prefs, eff, { limit, ...(res.overrides || {}), excludeIds: res.excludeIds, ...(args.overrides || {}) })
  if (args.discovery != null) opts.discovery = discoveryValue(args.discovery)
  const ranked = rank(res.candidates, profile, opts)
  const items = res.interleave ? spreadArtists(ranked) : ranked
  return { kind, items, releases: res.releases, candidates: res.candidates.length, errors: b.errors, requests: b.used, ms: Date.now() - t0, discovery: opts.discovery }
}

// ---------- neuerscheinungen pruefen ----------

let checking = null

export function releaseCheckRunning() {
  return !!checking
}

export async function checkReleases({ force = false, onProgress } = {}) {
  if (checking) return checking
  checking = (async () => {
    const prefs = music.prefs()
    const db = music.db()
    const profile = await music.profile()
    const favs = await music.favorites.byType('artist')
    const list = favs.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name }))
    if (prefs.releases.includeTopArtists) for (const a of profile.topArtists(prefs.releases.maxArtists)) if (a.id && !list.some((x) => x.id === a.id)) list.push({ id: a.id, name: a.name })
    const artists = list.slice(0, prefs.releases.maxArtists)
    const now = Date.now()
    const thisYear = new Date(now).getFullYear()
    const due = []
    for (const a of artists) {
      const rec = await db.get('artists', a.id)
      if (force || !rec || now - (rec.checkedAt || 0) > prefs.releases.intervalHours * 3600 * 1000) due.push({ ...a, rec })
    }
    let fresh = 0
    let checked = 0
    const errors = []
    for (const a of due) {
      try {
        const page = await catalog.artist(a.id, { maxAge: 3600 * 1000 })
        const baseline = !a.rec
        for (const r of page.releases) {
          const prev = await db.get('releases', r.id)
          if (prev) continue
          const isFresh = !baseline
          if (isFresh) fresh++
          await db.put('releases', { id: r.id, artistId: a.id, artistName: page.name || a.name, title: r.title, kind: r.kind || 'Album', year: r.year || null, thumbnail: r.thumbnail || '', firstSeen: now, fresh: isFresh, recent: !!r.year && r.year >= thisYear })
        }
        await db.put('artists', { id: a.id, name: page.name || a.name, checkedAt: Date.now(), releaseCount: page.releases.length, similar: page.similar.slice(0, 10) })
      } catch (e) {
        errors.push(`${a.name}: ${e.message}`)
      }
      checked++
      onProgress?.(checked, due.length)
    }
    // alte eintraege verlieren den neu status
    const maxAge = prefs.releases.maxAgeDays * DAY
    for (const r of await music.releases.all()) {
      if (r.fresh && now - r.firstSeen > maxAge) await db.put('releases', { ...r, fresh: false })
    }
    const result = { at: Date.now(), artists: artists.length, checked, fresh, errors }
    await music.setMeta('lastReleaseCheck', result)
    music.emit('releases', result)
    return result
  })().finally(() => {
    checking = null
  })
  return checking
}
