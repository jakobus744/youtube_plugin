import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseArtistPage, parseCollectionPage, parseSearchPage, parseMoodsPage, parseShelves, parseByline, splitArtistNames, parseQueueItem } from '../src/registry/music/parse.js'
import { extractInitialData } from '../src/registry/music/initialData.js'

// fixtures stammen aus tools/music-fixtures.mjs und koennen neu geladen werden
const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/music/${name}.json`, import.meta.url), 'utf8'))

test('initialData extraktion mit escapes', () => {
  const html = `<script>initialData.push({path: '\\/browse', params: JSON.parse('\\x7b\\x22browseId\\x22:\\x22X\\x22\\x7d'), data: '\\x7b\\x22a\\x22:\\x22b \\\\u00e4 \\x27q\\x27\\x22\\x7d'});</script>`
  const blocks = extractInitialData(html)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].path, '/browse')
  assert.equal(blocks[0].params.browseId, 'X')
  assert.equal(blocks[0].data.a, "b ä 'q'")
})

test('kuenstlerseite ohne lokalisierte titel', () => {
  const { data, params } = load('artist')
  const a = parseArtistPage(data, params.browseId)
  assert.equal(a.id, params.browseId)
  assert.ok(a.name)
  assert.ok(a.topSongs.length >= 3)
  for (const s of a.topSongs) {
    assert.ok(s.videoId)
    assert.ok(s.artists.some((x) => x.id === a.id))
  }
  assert.ok(a.releases.length >= 1)
  assert.ok(a.releases.every((r) => r.id.startsWith('MPREb_') && r.year))
  assert.ok(a.releases.some((r) => r.kind !== 'Album'), 'singles erkannt')
  assert.ok(a.similar.length >= 3)
  assert.ok(a.similar.every((s) => s.id.startsWith('UC')))
  assert.ok(a.featuredOn.every((p) => p.editorial))
})

test('zweiter kuenstler hat dieselbe struktur', () => {
  const { data, params } = load('artist2')
  const a = parseArtistPage(data, params.browseId)
  assert.ok(a.topSongs.length && a.releases.length && a.similar.length)
})

test('album und single seiten', () => {
  const single = load('single')
  const s = parseCollectionPage(single.data, single.params)
  assert.equal(s.type, 'album')
  assert.ok(s.year)
  assert.ok(s.artists.length)
  assert.equal(s.tracks.length, 1)
  assert.equal(s.tracks[0].type, 'song')
  assert.ok(s.tracks[0].durationSec > 60)
  const album = load('album')
  const a = parseCollectionPage(album.data, album.params)
  assert.equal(a.type, 'album')
  assert.ok(a.tracks.length > 3)
  assert.ok(a.tracks.every((t) => t.album?.id && t.artists.length && t.durationSec))
})

test('playlist mit dauer kuenstler und album pro song', () => {
  const { data, params } = load('playlist')
  const p = parseCollectionPage(data, params)
  assert.equal(p.type, 'playlist')
  assert.equal(p.tracks.length, p.trackCount)
  assert.ok(p.tracks.every((t) => t.videoId && t.durationSec && t.artists[0]?.id))
})

test('suche nach typ getrennt', () => {
  const { data } = load('search')
  const r = parseSearchPage(data)
  assert.ok(r.songs.length && r.artists.length && r.playlists.length)
  assert.ok(r.songs.every((s) => s.type === 'song' && s.artists.length))
  assert.ok(r.playlists.some((p) => p.editorial))
  assert.ok(r.podcasts.length >= 0)
})

test('stimmungen und genres', () => {
  const { data } = load('moods')
  const m = parseMoodsPage(data)
  assert.ok(m.moods.length >= 5)
  assert.ok(m.genres.length >= 10)
  assert.ok(m.genres.every((g) => g.name && g.params))
})

test('startseite regale', () => {
  const { data } = load('home')
  const shelves = parseShelves(data)
  assert.ok(shelves.some((s) => s.items.length))
})

test('byline und namen', () => {
  const b = parseByline([{ text: 'A', navigationEndpoint: { browseEndpoint: { browseId: 'UC1', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }, { text: ' • ' }, { text: '2024' }])
  assert.deepEqual(b.artists, [{ id: 'UC1', name: 'A' }])
  assert.equal(b.year, 2024)
  assert.deepEqual(splitArtistNames('Bonez MC, RAF Camora und Maxwell'), ['Bonez MC', 'RAF Camora', 'Maxwell'])
})

test('warteschlangen eintrag', () => {
  const q = parseQueueItem({
    playlistPanelVideoRenderer: {
      videoId: 'v1',
      title: { runs: [{ text: 'Song' }] },
      lengthText: { runs: [{ text: '2:13' }] },
      selected: true,
      longBylineText: { runs: [{ text: 'Artist', navigationEndpoint: { browseEndpoint: { browseId: 'UCx', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }, { text: ' • ' }, { text: 'Album', navigationEndpoint: { browseEndpoint: { browseId: 'MPREb_a', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' } } } } }, { text: ' • ' }, { text: '2025' }] }
    }
  })
  assert.equal(q.videoId, 'v1')
  assert.equal(q.durationSec, 133)
  assert.equal(q.artists[0].id, 'UCx')
  assert.equal(q.album.id, 'MPREb_a')
  assert.equal(q.year, 2025)
  assert.equal(q.selected, true)
})
