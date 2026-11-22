import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromViews, fromPlays, dedupe, period, previous, buckets, analyze, sessions, detail } from '../src/features/stats/logic.js'

const at = (s) => +new Date(s)
const view = (id, start, sec, ch, extra = {}) => ({ id, videoId: `v${id}`, title: `Video ${id}`, startedAt: at(start), wallSec: sec, channel: { id: ch, name: ch.toUpperCase() }, kind: 'video', percent: 1, ...extra })
const play = (id, start, sec, artist, extra = {}) => ({ id, videoId: `s${id}`, title: `Song ${id}`, startedAt: at(start), listenedSec: sec, artists: [{ name: artist }], artistKeys: [artist], completed: true, skipped: false, ...extra })

test('Quellen werden zu Ereignissen, doppelte Geräte zählen einmal', () => {
  const v = fromViews([view(1, '2026-11-10T20:00', 600, 'a', { category: 'Gaming' })], () => ['Spiele'])
  assert.deepEqual(v[0].cats, ['Gaming', 'Spiele'])
  const p = fromPlays([play(1, '2026-11-10T08:00', 180, 'x')], () => ['Techno'])
  assert.equal(p[0].src, 'music')
  assert.equal(dedupe([...v, ...v, ...p]).length, 2)
})

test('Zeiträume und Balken', () => {
  const now = at('2026-11-19T15:00')
  const w = period('week', now)
  assert.equal(new Date(w.from).getDay(), 1)
  assert.equal(buckets(w).list.length, 7)
  assert.equal(previous(w).to, w.from)
  const m = period('month', now)
  assert.equal(buckets(m).unit, 'day')
  assert.equal(buckets(m).list.length, 30)
  assert.equal(buckets(period('year', now)).unit, 'week')
  assert.equal(buckets(period('all', now, 0, at('2024-03-05'))).unit, 'month')
})

test('Auswertung: Balken, Heatmap, Rangfolge mit Trend, Anteile, Verhalten', () => {
  const now = at('2026-11-19T15:00')
  const ev = [
    ...fromViews([
      view(1, '2026-11-17T20:00', 1200, 'a', { category: 'Gaming' }),
      view(2, '2026-11-18T21:00', 600, 'b', { category: 'Bildung', percent: 0.1 }),
      view(3, '2026-11-11T20:00', 3000, 'b', { category: 'Bildung' })
    ]),
    ...fromPlays([play(1, '2026-11-17T08:00', 200, 'x'), play(2, '2026-11-17T08:05', 30, 'y', { completed: false, skipped: true, skipAtPct: 0.15 })], (p) => (p.artistKeys[0] === 'x' ? ['Techno'] : []))
  ]
  const r = analyze(ev, period('week', now))
  assert.equal(r.total, 2030)
  assert.equal(r.bars[1].yt, 1200)
  assert.equal(r.bars[1].music, 230)
  assert.equal(r.heat.yt[1][20], 1200)
  assert.equal(r.heat.music[1][8], 230)
  assert.equal(r.yt.top[0].key, 'a')
  assert.equal(r.yt.top[1].prevPlace, 1)
  assert.ok(r.yt.top[1].delta < 0)
  assert.equal(r.yt.cats.list[0].name, 'Gaming')
  assert.equal(r.music.cats.unknownSec, 30)
  assert.equal(r.music.behavior.skipBins[1], 1)
  assert.equal(r.yt.behavior.skipped, 0.5)
  assert.equal(r.discovery.fresh, 3)
  assert.equal(r.records.streak, 2)
})

test('Sitzungen und Detailansicht', () => {
  const ev = fromPlays([play(1, '2026-11-17T08:00', 180, 'x'), play(2, '2026-11-17T08:04', 180, 'x'), play(3, '2026-11-17T12:00', 100, 'x')])
  assert.equal(sessions(ev).length, 2)
  const d = detail(ev, { src: 'music', key: 'x' }, period('week', at('2026-11-19')))
  assert.equal(d.total, 460)
  assert.equal(d.hours[8], 360)
  assert.equal(d.count, 3)
})
