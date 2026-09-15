import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTracker } from '../src/features/music/logic/tracker.js'
import { buildProfile, playScore, DAY } from '../src/features/music/logic/taste.js'
import { compileRules, blockReason, termRegex } from '../src/features/music/logic/rules.js'
import { versionTags, baseTitle, trackKey } from '../src/features/music/logic/versions.js'
import { rank, discoveryValue } from '../src/features/music/logic/recommend.js'
import { computeStats, weekKey } from '../src/features/music/logic/stats.js'
import { effectiveSettings, matchMood } from '../src/features/music/logic/sessions.js'
import { skipDecision, queueTotals } from '../src/features/music/logic/queue.js'

const A = { id: 'UCa', name: 'Apache 207' }
const B = { id: 'UCb', name: 'Shirin David' }
const C = { id: 'UCc', name: 'Neu Künstler' }
const meta = (id, artists = [A], dur = 200, title = `Song ${id}`) => ({ videoId: id, title, artists, album: { id: `MPREb_${id}`, name: `Album ${id}` }, year: 2025, durationSec: dur })

// simuliert sekundenweise wiedergabe
function play(tracker, id, { from = 0, seconds, dur = 200, t0, liked = false, artists, rate = 1 }) {
  const out = []
  for (let i = 0; i <= seconds; i++) out.push(...tracker.sample({ ts: t0 + i * 1000, videoId: id, pos: from + i * rate, dur, playing: true, liked, rate, meta: meta(id, artists, dur) }))
  return out
}

test('tracker: vollstaendig gehoert beim naechsten song', () => {
  const t = createTracker()
  play(t, 'a', { seconds: 195, t0: 0 })
  const recs = play(t, 'b', { seconds: 2, t0: 200000 })
  assert.equal(recs.length, 1)
  const r = recs[0]
  assert.equal(r.videoId, 'a')
  assert.equal(r.completed, true)
  assert.equal(r.skipped, false)
  assert.ok(r.percent > 0.9)
  assert.equal(r.artists[0].id, 'UCa')
  assert.equal(r.album.id, 'MPREb_a')
})

test('tracker: frueher skip mit zeitpunkt', () => {
  const t = createTracker()
  play(t, 'a', { seconds: 6, t0: 0 })
  const [r] = play(t, 'b', { seconds: 1, t0: 10000 })
  assert.equal(r.skipped, true)
  assert.equal(r.quickSkip, true)
  assert.equal(r.skipAtSec, 6)
  assert.ok(r.skipAtPct < 0.05)
})

test('tracker: werbung und spruenge zaehlen nicht als gehoert', () => {
  const t = createTracker()
  t.sample({ ts: 0, videoId: 'a', pos: 0, dur: 200, playing: true, ad: true })
  play(t, 'a', { seconds: 10, t0: 1000 })
  // sprung ans ende
  t.sample({ ts: 12000, videoId: 'a', pos: 190, dur: 200, playing: true })
  const [r] = t.sample({ ts: 13000, videoId: 'b', pos: 0, dur: 100, playing: true })
  assert.ok(r.listenedSec <= 11)
  assert.equal(r.completed, false)
  assert.equal(r.skipped, true)
})

test('tracker: gedrosselte timer im hintergrund', () => {
  const t = createTracker()
  t.sample({ ts: 0, videoId: 'a', pos: 0, dur: 200, playing: true })
  t.sample({ ts: 60000, videoId: 'a', pos: 60, dur: 200, playing: true })
  t.sample({ ts: 120000, videoId: 'a', pos: 120, dur: 200, playing: true })
  const [r] = t.finish('unload', 121000)
  assert.equal(r.listenedSec, 120)
  assert.equal(r.skipped, false)
  assert.equal(r.reason, 'unload')
})

test('tracker: wiederholung und like', () => {
  const t = createTracker()
  play(t, 'a', { seconds: 196, t0: 0, liked: true })
  // loop zurueck auf anfang
  const loop = play(t, 'a', { seconds: 3, t0: 197000, from: 0 })
  assert.equal(loop.length, 1)
  assert.equal(loop[0].completed, true)
  assert.equal(loop[0].liked, true)
  play(t, 'a', { seconds: 190, t0: 201000, from: 4 })
  const [second] = t.finish('ended', 400000)
  assert.equal(second.repeat, true)
})

test('taste: skip gewichtung frueh staerker als spaet', () => {
  const early = playScore({ skipped: true, percent: 0.03 })
  const late = playScore({ skipped: true, percent: 0.85 })
  assert.ok(early < -1.4)
  assert.ok(late > -0.1 && late < 0)
  assert.ok(playScore({ completed: true, percent: 1, repeat: true, liked: true }) > 3)
})

test('taste: profil mit favoriten feedback und ausschluss', () => {
  const now = 100 * DAY
  const plays = [
    { videoId: 'a1', artists: [A], percent: 1, completed: true, startedAt: now - DAY, listenedSec: 200 },
    { videoId: 'a2', artists: [A], percent: 1, completed: true, startedAt: now - 2 * DAY, listenedSec: 180 },
    { videoId: 'b1', artists: [B], percent: 0.02, skipped: true, quickSkip: true, startedAt: now - DAY, listenedSec: 4 },
    { videoId: 'b1', artists: [B], percent: 0.02, skipped: true, startedAt: now - DAY, listenedSec: 4 },
    { videoId: 'b1', artists: [B], percent: 0.05, skipped: true, startedAt: now - DAY, listenedSec: 9 },
    { videoId: 'x', artists: [C], percent: 1, completed: true, startedAt: now, listenedSec: 100 }
  ]
  const p = buildProfile(plays, { now, favorites: [{ type: 'song', id: 's9', name: 'Fav', artists: [C] }], feedback: [{ type: 'artist', id: 'UCb', value: -1 }], excluded: { artists: [C] } })
  assert.ok(p.artistAffinity('UCa') > 0)
  assert.ok(p.artistAffinity('UCb') < 0)
  assert.equal(p.artistPlays('UCc'), 0)
  assert.equal(p.isHighSkip('b1'), true)
  assert.equal(p.topArtists(1)[0].id, 'UCa')
})

test('rules: begriffe als ganze woerter', () => {
  const r = compileRules({ artists: [{ id: 'UCb', name: 'Shirin David' }], songs: [{ videoId: 'bad' }], terms: ['live', 'sped up'] })
  assert.equal(blockReason({ videoId: 'x', title: 'Song (Live at Home)', artists: [A] }, r).kind, 'term')
  assert.equal(blockReason({ videoId: 'x', title: 'Song - Sped Up', artists: [A] }, r).kind, 'term')
  assert.equal(blockReason({ videoId: 'x', title: 'Delivery', artists: [A] }, r), null)
  assert.equal(blockReason({ videoId: 'x', title: 'Song', artists: [B] }, r).kind, 'artist')
  assert.equal(blockReason({ videoId: 'bad', title: 'Song', artists: [A] }, r).kind, 'song')
  assert.ok(termRegex('sped-up').test('SPED UP'))
})

test('versions: fassungen und basistitel', () => {
  assert.deepEqual(versionTags('Roller (Sped Up)'), ['spedup'])
  assert.ok(versionTags('Song - Live').includes('live'))
  assert.equal(baseTitle('Roller (feat. X) [Sped Up]'), 'roller')
  assert.equal(trackKey({ title: 'Roller - Slowed + Reverb', artists: [A] }), trackKey({ title: 'Roller', artists: [A] }))
})

test('recommend: discovery regler verschiebt bekannt gegen neu', () => {
  const now = 100 * DAY
  const plays = Array.from({ length: 10 }, (_, i) => ({ videoId: `a${i}`, artists: [A], percent: 1, completed: true, startedAt: now - 10 * DAY, listenedSec: 200 }))
  const profile = buildProfile(plays, { now })
  const candidates = [
    { videoId: 'known', title: 'Bekannt', artists: [A], sources: [{ kind: 'topArtist' }] },
    { videoId: 'fresh', title: 'Neu', artists: [C], sources: [{ kind: 'similar', via: 'Apache 207', viaKey: 'UCa' }] }
  ]
  const fam = rank(candidates, profile, { discovery: 'familiar', now })
  const exp = rank(candidates, profile, { discovery: 'explore', now })
  assert.equal(fam[0].videoId, 'known')
  assert.equal(exp[0].videoId, 'fresh')
  assert.ok(exp.find((c) => c.videoId === 'fresh').reasons.includes('Ähnlich zu Apache 207'))
  assert.ok(exp.find((c) => c.videoId === 'fresh').reasons.includes('Noch nie gehört'))
  assert.equal(discoveryValue('balanced'), 0.5)
})

test('recommend: blocklisten ignoriert doppelte fassungen', () => {
  const profile = buildProfile([], {})
  const rules = compileRules({ terms: ['remix'] })
  const out = rank(
    [
      { videoId: '1', title: 'Roller', artists: [A], sources: [{ kind: 'favoriteArtist' }] },
      { videoId: '2', title: 'Roller (Slowed)', artists: [A], sources: [{ kind: 'favoriteArtist' }] },
      { videoId: '3', title: 'Other Remix', artists: [A], sources: [{ kind: 'favoriteArtist' }] }
    ],
    profile,
    { rules }
  )
  assert.deepEqual(out.map((c) => c.videoId), ['1'])
})

test('stats: tops, skip quote, wochen und tageszeit', () => {
  const base = new Date(2026, 8, 14, 20, 0).getTime()
  const plays = [
    { videoId: 'a', title: 'A', artists: [A], album: { id: 'm1', name: 'M1' }, startedAt: base, listenedSec: 200, completed: true },
    { videoId: 'a', title: 'A', artists: [A], album: { id: 'm1', name: 'M1' }, startedAt: base + 1000, listenedSec: 200, completed: true },
    { videoId: 'b', title: 'B', artists: [B], startedAt: base + 2000, listenedSec: 5, skipped: true },
    { videoId: 'b', title: 'B', artists: [B], startedAt: base + 7 * DAY, listenedSec: 5, skipped: true }
  ]
  const s = computeStats(plays)
  assert.equal(s.totals.plays, 4)
  assert.equal(s.totals.skipRate, 0.5)
  assert.equal(s.topSongs[0].videoId, 'a')
  assert.equal(s.topArtists[0].name, 'Apache 207')
  assert.equal(s.topAlbums[0].id, 'm1')
  assert.equal(s.series.length, 2)
  assert.equal(s.byHour[20].plays, 4)
  assert.match(weekKey(base), /^2026-W\d\d$/)
})

test('sessions: preset ueberschreibt nur temporaer', () => {
  const prefs = { discovery: 0.5, blocklist: { terms: ['karaoke'] } }
  const eff = effectiveSettings(prefs, { presetId: 'focus' })
  assert.equal(eff.discovery, 0.25)
  assert.ok(eff.blocklist.terms.includes('karaoke') && eff.blocklist.terms.includes('live'))
  assert.deepEqual(prefs.blocklist.terms, ['karaoke'])
  assert.equal(effectiveSettings(prefs, null).discovery, 0.5)
  assert.equal(matchMood([{ name: 'Workout' }, { name: 'Chillig' }], ['chill']).name, 'Chillig')
})

test('queue: ueberspringen und dauer', () => {
  const now = 10 * DAY
  const profile = buildProfile([1, 2, 3].map((i) => ({ videoId: 'bad', artists: [A], skipped: true, percent: 0.01, startedAt: now - i })), { now })
  const rules = compileRules({ terms: ['live'] })
  const recentKeys = new Map([[trackKey({ title: 'Roller', artists: [A] }), { videoId: 'orig', ts: now - 1000 }]])
  assert.equal(skipDecision({ videoId: 'x', title: 'Live Song', artists: [A] }, { rules, profile, now }).kind, 'term')
  assert.equal(skipDecision({ videoId: 'bad', title: 'Ok', artists: [A] }, { rules, profile, settings: { skipHighSkip: true }, now }).kind, 'highSkip')
  assert.equal(skipDecision({ videoId: 'dup', title: 'Roller (Sped Up)', artists: [A] }, { profile, recentKeys, now }).kind, 'duplicate')
  assert.equal(skipDecision({ videoId: 'new', title: 'Neu', artists: [C] }, { profile, settings: { onlyKnownArtists: true }, now }).kind, 'unknown')
  assert.equal(skipDecision({ videoId: 'ok', title: 'Ok', artists: [A] }, { rules, profile, now }), null)
  const q = queueTotals([{ durationSec: 100 }, { durationSec: 200 }, { durationSec: null }, { durationSec: 50 }], 1, 50)
  assert.deepEqual(q, { total: 350, remaining: 200, unknown: 1, count: 4, after: 2 })
})
