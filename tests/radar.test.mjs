import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyState, applyScan, acknowledge, isInteresting, BASELINE_MS, describeFresh } from '../src/core/radarLogic.js'

test('Elementnamen', () => {
  assert.ok(isInteresting('ytm-pivot-bar-renderer'))
  assert.ok(isInteresting('like-button-view-model'))
  assert.ok(isInteresting('ytmusic-player-bar'))
  assert.ok(!isInteresting('div'))
  assert.ok(!isInteresting('my-widget'))
})

test('in der Eingewoehnung wird nichts gemeldet, danach schon', () => {
  const s = emptyState()
  const t0 = 1_000_000
  assert.equal(applyScan(s, { tags: ['ytm-a'], flags: ['f1'], page: 'home', now: t0 }), true)
  assert.equal(s.fresh.length, 0)
  assert.equal(applyScan(s, { tags: ['ytm-a'], flags: ['f1'], page: 'home', now: t0 + 1000 }), false)
  const later = t0 + BASELINE_MS + 5
  applyScan(s, { tags: ['ytm-a', 'ytm-neu'], flags: ['f1', 'f2'], page: 'watch', now: later })
  assert.deepEqual(s.fresh.map((f) => f.name), ['ytm-neu', 'f2'])
  assert.equal(describeFresh(s).length, 2)
  assert.equal(acknowledge(s), 2)
  assert.equal(s.fresh.length, 0)
  // bekannt bleibt bekannt
  assert.equal(applyScan(s, { tags: ['ytm-neu'], flags: [], page: 'watch', now: later + 10 }), false)
})
