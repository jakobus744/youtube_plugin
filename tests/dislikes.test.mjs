import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVotes, formatCount, likesFromLabel, adjustCount } from '../src/core/dislikes.js'

test('Antwort des Dienstes', () => {
  assert.deepEqual(parseVotes({ likes: 100, dislikes: 5, rating: 4.7 }), { likes: 100, dislikes: 5 })
  assert.equal(parseVotes({ likes: 1 }), null)
  assert.equal(parseVotes(null), null)
  assert.equal(parseVotes({ dislikes: -3 }), null)
})

test('Zahl kompakt', () => {
  assert.match(formatCount(1234, 'en'), /1\.2K/)
  assert.equal(formatCount(42, 'en'), '42')
})

test('Likes aus der Beschriftung', () => {
  assert.equal(likesFromLabel('Dieses Video liken (bisher 20.052.981 positive Bewertungen)'), 20052981)
  assert.equal(likesFromLabel('like this video along with 1,234 other people'), 1234)
  assert.equal(likesFromLabel('Like'), null)
})

test('Zahl nach Druck auf den Knopf', () => {
  // Quelle bleibt gleich: Druck auf Like zaehlt eins dazu, Zuruecknehmen eins ab
  assert.equal(adjustCount(100, 100, false, true), 101)
  assert.equal(adjustCount(100, 100, true, false), 99)
  // Quelle hat aktualisiert: ihre Zahl gilt
  assert.equal(adjustCount(100, 101, false, true), 101)
  assert.equal(adjustCount(null, 5, false, true), 5)
  assert.equal(adjustCount(0, 0, true, false), 0)
})
