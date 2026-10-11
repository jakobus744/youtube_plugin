import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVotes, formatCount } from '../src/core/dislikes.js'

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
