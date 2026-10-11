import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanShareUrl, cleanShareText } from '../src/core/shareLink.js'

test('si und pp werden entfernt, Rest bleibt', () => {
  assert.equal(cleanShareUrl('https://youtu.be/abc123?si=XyZ'), 'https://youtu.be/abc123')
  assert.equal(cleanShareUrl('https://www.youtube.com/watch?v=abc123&si=XyZ&t=42'), 'https://www.youtube.com/watch?v=abc123&t=42')
  assert.equal(cleanShareUrl('https://m.youtube.com/watch?v=abc123&list=PL1&pp=ygUD'), 'https://m.youtube.com/watch?v=abc123&list=PL1')
})

test('fremde Links und Links ohne Anhang bleiben unveraendert', () => {
  assert.equal(cleanShareUrl('https://example.com/?si=1'), 'https://example.com/?si=1')
  assert.equal(cleanShareUrl('https://youtu.be/abc123'), 'https://youtu.be/abc123')
  assert.equal(cleanShareUrl('kein link'), 'kein link')
})

test('Text mit Link', () => {
  assert.equal(cleanShareText('Schau mal: https://youtu.be/abc123?si=XyZ. Gut!'), 'Schau mal: https://youtu.be/abc123. Gut!')
  assert.equal(cleanShareText(null), null)
  assert.equal(cleanShareText('ohne Link'), 'ohne Link')
})
