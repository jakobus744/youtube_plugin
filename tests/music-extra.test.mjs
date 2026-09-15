import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatLyrics } from '../src/features/music/logic/lyrics.js'
import { normalizePrefs, defaultPrefs } from '../src/features/music/data/prefs.js'
import { pageFromUrl, videoIdFromUrl, browseIdFromUrl } from '../src/registry/music/pages.js'
import { shelfKind, chipKind } from '../src/registry/music/tags.js'
import { parseShelves } from '../src/registry/music/parse.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/music/${name}.json`, import.meta.url), 'utf8'))

test('music seiten aus urls', () => {
  assert.equal(pageFromUrl('https://music.youtube.com/'), 'home')
  assert.equal(pageFromUrl('https://music.youtube.com/watch?v=abc&list=RD1'), 'watch')
  assert.equal(pageFromUrl('https://music.youtube.com/channel/UCI_7ZfCLlHu5IOvyQv2O9TQ'), 'artist')
  assert.equal(pageFromUrl('https://music.youtube.com/@zah1de'), 'artist')
  assert.equal(pageFromUrl('https://music.youtube.com/browse/MPREb_Ranz1zScnEq'), 'album')
  assert.equal(pageFromUrl('https://music.youtube.com/playlist?list=OLAK5uy_x'), 'playlist')
  assert.equal(pageFromUrl('https://music.youtube.com/browse/FEmusic_moods_and_genres_category?params=x'), 'genre')
  assert.equal(pageFromUrl('https://music.youtube.com/library/playlists'), 'library')
  assert.equal(pageFromUrl('https://music.youtube.com/search?q=x'), 'search')
  assert.equal(pageFromUrl('https://music.youtube.com/was/anderes'), 'other')
  assert.equal(videoIdFromUrl('https://music.youtube.com/watch?v=abc'), 'abc')
  assert.equal(browseIdFromUrl('https://music.youtube.com/browse/VLPL123'), 'VLPL123')
})

test('songtext formate', () => {
  const plain = { available: true, timed: false, lines: [{ text: 'Zeile eins' }, { text: '' }, { text: '' }, { text: '' }, { text: 'Zeile zwei  ' }], source: 'Quelle: LyricFind' }
  const meta = { title: 'Song', artists: [{ name: 'A' }, { name: 'B' }], album: { name: 'Album' } }
  assert.equal(formatLyrics(plain), 'Zeile eins\n\nZeile zwei')
  assert.equal(formatLyrics(plain, { mode: 'header', meta }), 'Song – A, B\n\nZeile eins\n\nZeile zwei\n\nQuelle: LyricFind')
  // ohne zeitstempel faellt timestamps auf text zurueck
  assert.equal(formatLyrics(plain, { mode: 'timestamps' }), 'Zeile eins\n\nZeile zwei')
  const timed = { available: true, timed: true, lines: [{ text: 'Hallo', startMs: 1500 }, { text: 'Welt', startMs: 65230 }] }
  assert.equal(formatLyrics(timed, { mode: 'timestamps' }), '[0:01] Hallo\n[1:05] Welt')
  assert.equal(formatLyrics(timed, { mode: 'lrc', meta }), '[ti:Song]\n[ar:A, B]\n[al:Album]\n[00:01.50]Hallo\n[01:05.23]Welt')
  assert.equal(formatLyrics({ available: false, reason: 'x' }), '')
})

test('music vorlieben bereinigen', () => {
  const d = defaultPrefs()
  assert.deepEqual(normalizePrefs(null), d)
  const p = normalizePrefs({
    discovery: 7,
    history: { paused: 1, retentionDays: '30', minListenSec: -5 },
    blocklist: { artists: [{ name: 'X' }, 'kaputt', { id: 'UC1' }], songs: [{ title: 'ohne id' }, { videoId: 'v1' }], terms: [' live ', 'live', ''] },
    smartQueue: { autoSkip: 'ja', unbekannt: true },
    providers: { lastfm: { enabled: true, apiKey: 'k' }, local: { enabled: false }, fremd: { enabled: true } },
    weights: { skip: -99, like: 'x' }
  })
  assert.equal(p.discovery, 1)
  assert.equal(p.history.paused, true)
  assert.equal(p.history.retentionDays, 30)
  assert.equal(p.history.minListenSec, 0)
  assert.deepEqual(p.blocklist.artists, [{ id: null, name: 'X' }, { id: 'UC1', name: 'UC1' }])
  assert.equal(p.blocklist.songs.length, 1)
  assert.deepEqual(p.blocklist.terms, ['live'])
  assert.equal(p.smartQueue.autoSkip, true)
  assert.equal(p.smartQueue.unbekannt, undefined)
  assert.equal(p.providers.lastfm.enabled, true)
  assert.equal(p.providers.lastfm.apiKey, 'k')
  assert.equal(p.providers.local.enabled, false)
  assert.equal(p.providers.fremd, undefined)
  assert.equal(p.weights.skip, -10)
  assert.equal(p.weights.like, d.weights.like)
})

test('regale und chips sprachunabhaengig einordnen', () => {
  const home = fixture('home')
  const shelves = []
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 30) return
    if (o.musicCarouselShelfRenderer) shelves.push(o.musicCarouselShelfRenderer)
    for (const k of Object.keys(o)) walk(o[k], depth + 1)
  }
  walk(home.data)
  assert.ok(shelves.length > 0)
  const kinds = shelves.map(shelfKind)
  assert.ok(kinds.every((k) => ['song', 'video', 'album', 'playlist', 'artist', 'podcast', 'samples', null].includes(k)), kinds.join(','))
  assert.ok(parseShelves(home.data).length > 0)
  const podcastChip = { navigationEndpoint: { browseEndpoint: { browseId: 'FEmusic_home', params: 'ggNCSgQIDBADSgQIBBABSgQICRABSgQICBABSgQIBxABSgQIDhABSgQIAxABSgQIDRABSgQIChABSgQIBhABSgQIBRAB' } } }
  const workoutChip = { navigationEndpoint: { browseEndpoint: { browseId: 'FEmusic_home', params: 'ggNCSgQIDBABSgQIBBADSgQICRABSgQICBABSgQIBxABSgQIDhABSgQIAxABSgQIDRABSgQIChABSgQIBhABSgQIBRAB' } } }
  assert.equal(chipKind(podcastChip), 'podcasts')
  assert.equal(chipKind(workoutChip), null)
})

test('radio verteilt kuenstler', async () => {
  const { spreadArtists } = await import('../src/features/music/engine.js')
  const t = (id, a) => ({ videoId: id, artists: [{ id: a, name: a }] })
  const out = spreadArtists([t('1', 'A'), t('2', 'A'), t('3', 'A'), t('4', 'B'), t('5', 'C')]).map((x) => x.videoId)
  assert.deepEqual(out, ['1', '4', '2', '5', '3'])
})
