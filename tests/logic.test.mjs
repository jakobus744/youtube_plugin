import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileRules, evaluate, REASONS } from '../src/appliers/filterLogic.js'
import { normalize, normalizeProfile, splitLegacy, defaultFilters } from '../src/core/config.js'
import { parseDuration, formatDuration, parseAgeDays, firstInt, clock } from '../src/core/format.js'
import { summarize } from '../src/features/youtube/playlist/common.js'
import { templates } from '../src/profiles/index.js'
import { sites } from '../src/sites/index.js'

const yt = sites.youtube

const video = (o = {}) => ({ kind: 'video', videoId: 'x', title: 'Normal title', channel: 'Some Channel', channelUrl: '/@somechannel', channelId: 'UCabcdefghijklmnopqrstuv', durationSec: 600, isShort: false, live: false, percent: null, ageDays: 10, ...o })
const rules = (patch) => {
  const f = defaultFilters()
  f.enabled = true
  return compileRules(Object.assign(f, patch))
}

test('format helfer', () => {
  assert.equal(parseDuration('1:02:03'), 3723)
  assert.equal(parseDuration('\n0:53\n'), 53)
  assert.equal(parseDuration('LIVE'), null)
  assert.equal(formatDuration(15780), '4 h 23 min')
  assert.equal(formatDuration(97200, { long: 'days' }), '1 d 3 h')
  assert.equal(formatDuration(30), '< 1 min')
  assert.equal(parseAgeDays('vor 3 Jahren'), 1095)
  assert.equal(parseAgeDays('2 weeks ago'), 14)
  assert.equal(parseAgeDays('Premiere'), null)
  assert.equal(firstInt('242 Videos 531.579 Aufrufe'), 242)
  assert.equal(clock(3723), '1:02:03')
})

test('filter kanal ueber handle id und name', () => {
  assert.equal(evaluate(video(), rules({ channels: { block: ['@somechannel'], allowOnly: [] } })), REASONS.channel)
  assert.equal(evaluate(video(), rules({ channels: { block: ['UCabcdefghijklmnopqrstuv'], allowOnly: [] } })), REASONS.channel)
  assert.equal(evaluate(video(), rules({ channels: { block: ['some channel'], allowOnly: [] } })), REASONS.channel)
  assert.equal(evaluate(video(), rules({ channels: { block: ['@other'], allowOnly: [] } })), null)
  assert.equal(evaluate(video(), rules({ channels: { block: [], allowOnly: ['@other'] } })), REASONS.allowOnly)
})

test('filter titel stichwort und regex', () => {
  assert.equal(evaluate(video({ title: 'INSANE reaction' }), rules({ title: { keywords: ['reaction'], regex: [], caseSensitive: false } })), REASONS.keyword)
  assert.equal(evaluate(video({ title: 'SHOCKING news' }), rules({ title: { keywords: [], regex: ['^shock'], caseSensitive: false } })), REASONS.regex)
  const bad = rules({ title: { keywords: [], regex: ['(['], caseSensitive: false } })
  assert.equal(bad.errors.length, 1)
  assert.equal(evaluate(video(), bad), null)
})

test('filter typen dauer alter gesehen', () => {
  assert.equal(evaluate(video({ isShort: true }), rules({ shorts: true })), REASONS.short)
  assert.equal(evaluate(video({ durationSec: 45 }), rules({ duration: { minSec: 61, maxSec: null } })), REASONS.tooShort)
  assert.equal(evaluate(video({ durationSec: 7200 }), rules({ duration: { minSec: null, maxSec: 3600 } })), REASONS.tooLong)
  assert.equal(evaluate(video({ ageDays: 400 }), rules({ age: { maxDays: 365 } })), REASONS.old)
  assert.equal(evaluate(video({ percent: 95 }), rules({ watched: { hide: true, minPercent: 90 } })), REASONS.watched)
  // playlists und mixe nur nach kanal und titel
  assert.equal(evaluate(video({ kind: 'playlist', isShort: true }), rules({ shorts: true })), null)
})

test('normalize wirft unbekanntes raus und prueft modi', () => {
  const cfg = normalize(
    {
      display: { 'watch.comments': 'collapse', 'top.create': 'collapse', 'gibt.es.nicht': 'hide', 'watch.sidebar': 'show' },
      vars: { theme: 'nord', radius: 999, bg: 'rot', accent: '#ff0000', unbekannt: 3 },
      layout: { presets: { watch: 'theater', home: 'theater' }, order: { 'watch.actions': ['share', 'like', 'quatsch', 'share'] } },
      behavior: { shortsRedirect: 1, homeRedirect: '/evil' },
      filters: { enabled: true, mode: 'boom', title: { regex: ['a', '', ' b '] } },
      features: { 'transcript.copy': { enabled: true, format: 'pdf', pauseMs: 99999 } }
    },
    yt
  )
  assert.deepEqual(cfg.display, { 'watch.comments': 'collapse' })
  assert.equal(cfg.vars.theme, 'nord')
  assert.equal(cfg.vars.radius, 24)
  assert.equal(cfg.vars.bg, undefined)
  assert.equal(cfg.vars.accent, '#ff0000')
  assert.deepEqual(cfg.layout.presets, { watch: 'theater' })
  assert.deepEqual(cfg.layout.order['watch.actions'], ['share', 'like'])
  assert.equal(cfg.behavior.shortsRedirect, true)
  assert.equal(cfg.behavior.homeRedirect, undefined)
  assert.equal(cfg.filters.mode, 'dim')
  assert.deepEqual(cfg.filters.title.regex, ['a', 'b'])
  assert.equal(cfg.features['transcript.copy'].format, 'markdown')
  assert.equal(cfg.features['transcript.copy'].pauseMs, 6000)
  assert.equal(cfg.features['playlist.duration'].enabled, false)
})

test('profile vorlagen sind gueltig', () => {
  for (const t of templates) {
    const raw = t.config()
    for (const key of ['youtube', 'music']) {
      const cfg = normalize(raw[key], sites[key])
      assert.equal(Object.keys(cfg.display).length, Object.keys(raw[key].display || {}).length, `${t.id}/${key}: display eintraege verloren`)
      for (const [id, f] of Object.entries(raw[key].features || {})) assert.equal(cfg.features[id]?.enabled, f.enabled, `${t.id}/${key}: feature ${id} unbekannt`)
    }
  }
})

test('registry ids eindeutig und modi gueltig', () => {
  const ids = new Set()
  const fids = []
  for (const site of Object.values(sites)) {
    for (const t of site.targets) {
      assert.ok(!ids.has(t.id), `doppelte id ${t.id}`)
      ids.add(t.id)
      assert.ok(t.modes.includes('show'))
      assert.ok(t.sel.length > 0)
      assert.ok(site.GROUPS.includes(t.group), `${t.id}: gruppe ${t.group} fehlt`)
    }
    fids.push(...site.features.map((m) => m.id))
    for (const tab of site.panelTabs) assert.ok(typeof tab === 'string')
  }
  assert.equal(new Set(fids).size, fids.length)
})

test('playlist summe mit schwelle und ohne dauer', () => {
  const s = summarize(
    [
      { durationSec: 600, percent: 100 },
      { durationSec: 600, percent: 50 },
      { durationSec: 600, percent: 95 },
      { durationSec: null, unavailable: true },
      { live: true }
    ],
    { doneThreshold: 90 }
  )
  assert.equal(s.total, 1800)
  assert.equal(s.watched, 1500)
  assert.equal(s.remaining, 300)
  assert.equal(s.unavailable, 1)
  assert.equal(s.live, 1)
})

test('alte flache config wandert in den youtube abschnitt', () => {
  const legacy = { display: { 'watch.comments': 'hide' }, features: { 'transcript.copy': { enabled: true } } }
  assert.deepEqual(Object.keys(splitLegacy(legacy)), ['youtube'])
  const p = normalizeProfile(legacy, sites)
  assert.equal(p.schema, 3)
  assert.equal(p.youtube.display['watch.comments'], 'hide')
  assert.equal(p.youtube.features['transcript.copy'].enabled, true)
  assert.deepEqual(p.music.display, {})
  assert.equal(p.music.filters, undefined)
  assert.equal(p.music.features['m.history'].enabled, false)
})

test('music normalize kennt eigene registry', () => {
  const cfg = normalize({ display: { 'm.guide.samples': 'hide', 'watch.comments': 'hide', 'm.home.podcasts': 'collapse' }, vars: { theme: 'vinyl', playerBar: '#112233' }, layout: { presets: { watch: 'lyricsFocus', home: 'theater' } }, behavior: { 'm.stillThere': 1 } }, sites.music)
  assert.deepEqual(cfg.display, { 'm.guide.samples': 'hide', 'm.home.podcasts': 'collapse' })
  assert.equal(cfg.vars.theme, 'vinyl')
  assert.equal(cfg.vars.playerBar, '#112233')
  assert.deepEqual(cfg.layout.presets, { watch: 'lyricsFocus' })
  assert.equal(cfg.behavior['m.stillThere'], true)
})
