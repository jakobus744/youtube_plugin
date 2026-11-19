import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectTypes, typeTags, siteOfHost } from '../src/core/ytTypes.js'

test('Bausteine mit übergeordnetem Baustein', () => {
  const json = { contents: { richGridRenderer: { contents: [{ richSectionRenderer: { content: { richShelfRenderer: { contents: [{ miniGameCardViewModel: { title: 'x' } }] } } } }, { richItemRenderer: {} }] } } }
  const m = collectTypes(json)
  assert.deepEqual([...m.entries()], [
    ['richGridRenderer', ''],
    ['richSectionRenderer', 'richGridRenderer'],
    ['richShelfRenderer', 'richSectionRenderer'],
    ['miniGameCardViewModel', 'richShelfRenderer'],
    ['richItemRenderer', 'richGridRenderer']
  ])
})

test('Andere Schlüssel zählen nicht', () => {
  assert.equal(collectTypes({ commandMetadata: { webCommandMetadata: {} }, Renderer: 1, trackingParams: 'x' }).size, 0)
})

test('Html-Namen und Seite', () => {
  assert.deepEqual(typeTags('miniGameCardViewModel'), ['mini-game-card-view-model', 'yt-mini-game-card-view-model', 'ytm-mini-game-card-view-model', 'ytd-mini-game-card-view-model', 'ytmusic-mini-game-card-view-model'])
  assert.equal(siteOfHost('m.youtube.com'), 'mobile')
  assert.equal(siteOfHost('music.youtube.com'), 'music')
  assert.equal(siteOfHost('www.youtube.com'), 'youtube')
})
