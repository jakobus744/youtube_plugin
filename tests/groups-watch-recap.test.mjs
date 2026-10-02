import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGroups, visibleIn, toggleChannel, groupsOf, enrich, sameChannel, NONE } from '../src/features/youtube/subGroups/logic.js'
import { channelRefOf } from '../src/registry/youtube/paths.js'
import { dayKey, startOfDay, createSession, tickSession, reminderDue, watchStats, DAY } from '../src/features/youtube/watchtime/logic.js'
import { weekStart, lastWeekStart, weeklyRecap, weekLabel } from '../src/features/music/logic/recap.js'

test('abo gruppen: bereinigen, zuordnen, filtern', () => {
  const d = normalizeGroups({ groups: [{ id: 'tech', name: ' Tech ', channels: [{ id: 'UC1', name: 'Fireship' }, { id: 'UC1', name: 'doppelt' }, { name: '' }] }, { name: '' }, 'kaputt', { id: 'tech', name: 'Musik', channels: [] }] })
  assert.equal(d.groups.length, 2)
  assert.equal(d.groups[0].name, 'Tech')
  assert.equal(d.groups[0].channels.length, 1)
  assert.notEqual(d.groups[1].id, 'tech')

  const card = channelRefOf({ channel: 'Theo - t3.gg', channelUrl: '/@t3dotgg' })
  assert.deepEqual(card, { id: null, handle: '@t3dotgg', name: 'Theo - t3.gg' })
  assert.equal(toggleChannel(d, d.groups[1].id, card), true)
  assert.ok(visibleIn(card, d.groups[1].id, d))
  assert.ok(!visibleIn(card, 'tech', d))
  assert.ok(!visibleIn(card, NONE, d))
  assert.ok(visibleIn({ name: 'Anderer' }, NONE, d))
  assert.ok(visibleIn(card, null, d))

  // spaeter mit id gesehen: wird nachgetragen und passt dann ueber die id
  assert.ok(enrich(d, { id: 'UC9', handle: '@t3dotgg', name: 'Theo - t3.gg' }))
  assert.equal(d.groups[1].channels[0].id, 'UC9')
  assert.ok(sameChannel(d.groups[1].channels[0], { id: 'UC9', name: 'umbenannt' }))
  // kachel ohne id und handle passt ueber den namen
  assert.deepEqual(groupsOf({ name: 'fireship' }, d).map((g) => g.id), ['tech'])
  assert.equal(toggleChannel(d, 'tech', { id: 'UC1' }), false)
  assert.equal(d.groups[0].channels.length, 0)
})

test('schauzeit: sitzung zaehlt nur echte wiedergabe', () => {
  const t0 = new Date(2026, 8, 24, 20, 0, 0).getTime()
  const p = { videoId: 'v1', kind: 'video', title: 'T', channel: { id: 'UC1', name: 'K' }, playing: true, ad: false, pos: 10, dur: 600 }
  const s = createSession(p, t0)
  tickSession(s, p, 1, t0 + 1000)
  tickSession(s, { ...p, ad: true }, 1, t0 + 2000)
  tickSession(s, { ...p, playing: false }, 1, t0 + 3000)
  tickSession(s, { ...p, pos: 300 }, 1, t0 + 4000)
  assert.equal(s.wallSec, 2)
  assert.equal(s.day, '2026-09-24')
  assert.equal(s.percent, 0.5)
  assert.equal(dayKey(startOfDay(t0) + DAY), '2026-09-25')
})

test('schauzeit: limit und pause erinnern sanft und wiederholt', () => {
  const state = { limitAt: null, breakAt: null }
  const base = { limitMin: 60, breakMin: 45, remindEveryMin: 15, state }
  assert.equal(reminderDue({ ...base, todaySec: 59 * 60, streakSec: 10 }), null)
  const a = reminderDue({ ...base, todaySec: 60 * 60, streakSec: 10 })
  assert.equal(a.kind, 'limit')
  state.limitAt = a.mark
  assert.equal(reminderDue({ ...base, todaySec: 70 * 60, streakSec: 10 }), null)
  assert.equal(reminderDue({ ...base, todaySec: 75 * 60, streakSec: 10 }).kind, 'limit')
  const b = reminderDue({ ...base, limitMin: 0, todaySec: 999, streakSec: 45 * 60 })
  assert.equal(b.kind, 'break')
  state.breakAt = b.mark
  assert.equal(reminderDue({ ...base, limitMin: 0, todaySec: 999, streakSec: 60 * 60 }), null)
  assert.equal(reminderDue({ ...base, limitMin: 0, todaySec: 999, streakSec: 90 * 60 }).kind, 'break')
})

test('schauzeit: statistik pro tag, kanal und shorts', () => {
  const now = new Date(2026, 8, 24, 21, 0).getTime()
  const v = (d, sec, ch, kind = 'video', id = `${d}${ch}${sec}`) => ({ id, videoId: id, kind, title: id, channel: { id: ch, name: ch }, startedAt: startOfDay(now) - d * DAY + 3600e3, day: dayKey(startOfDay(now) - d * DAY), wallSec: sec })
  const views = [v(0, 600, 'A'), v(0, 300, 'B', 'short'), v(1, 1200, 'A'), v(9, 5000, 'A')]
  const st = watchStats(views, { from: startOfDay(now) - 6 * DAY, to: now + 1, now, days: 7 })
  assert.equal(st.total, 2100)
  assert.equal(st.shorts, 300)
  assert.equal(st.byDay.length, 7)
  assert.equal(st.byDay.at(-1).sec, 900)
  assert.equal(st.byDay.at(-2).sec, 1200)
  assert.equal(st.topChannels[0].name, 'A')
  assert.equal(st.activeDays, 2)
})

test('wochenrueckblick: woche ab montag, neue kuenstler', () => {
  const wed = new Date(2026, 8, 23, 18, 0).getTime()
  const mon = weekStart(wed)
  assert.equal(new Date(mon).getDay(), 1)
  assert.equal(new Date(mon).getDate(), 21)
  const last = lastWeekStart(wed)
  assert.equal(new Date(last).getDate(), 14)
  assert.equal(weekLabel(last), '14.–20.9.2026')
  const play = (daysAfter, a, sec, extra = {}) => ({ videoId: `${a}${daysAfter}${sec}`, title: `Song ${a}`, artists: [{ id: a, name: a }], startedAt: last + daysAfter * DAY + 3600e3, listenedSec: sec, ...extra })
  const plays = [play(-30, 'ALT', 100), play(1, 'ALT', 600), play(2, 'NEU', 300), play(3, 'NEU', 200, { skipped: true }), play(9, 'SPAETER', 900)]
  const r = weeklyRecap(plays, last)
  assert.equal(r.plays, 3)
  assert.equal(r.listenedSec, 1100)
  assert.deepEqual(r.topArtists.map((a) => a.name), ['ALT', 'NEU'])
  assert.deepEqual(r.newArtists.map((a) => a.name), ['NEU'])
  assert.equal(r.newArtistCount, 1)
  assert.equal(Math.round(r.skipRate * 100), 33)
  assert.equal(weeklyRecap(plays, last - 14 * DAY), null)
})

test('mobil: farbvariablen am wert erkennen', async () => {
  const { normColor, discoverTokens } = await import('../src/registry/mobile/look.js')
  assert.equal(normColor('rgb(15, 15, 15)'), '#0f0f0f')
  assert.equal(normColor('#FFF'), '#ffffff')
  assert.equal(normColor('rgba(15,15,15,0.7)'), '#0f0f0f@0.7')
  assert.equal(normColor('transparent'), null)
  const vars = [['--t3e41d7b17b187f69', '#0f0f0f'], ['--t5978da8d584b8fe9', 'rgba(15,15,15,0.7)'], ['--t1405e70a39276293', '#f1f1f1'], ['--t4a6da19e16bf221a', '#aaa'], ['--yt-light-wash-x', '0'], ['--t2d807bb79e75606d', '#3ea6ff'], ['--tffffffff00000000', '#123456']]
  const map = discoverTokens(vars, { bg: 'rgb(15, 15, 15)', text: 'rgb(241, 241, 241)', textSecondary: '#aaaaaa', accent: '#3ea6ff' })
  assert.deepEqual(map.bg, [{ name: '--t3e41d7b17b187f69', alpha: 1 }, { name: '--t5978da8d584b8fe9', alpha: 0.7 }])
  assert.deepEqual(map.text.map((x) => x.name), ['--t1405e70a39276293'])
  assert.deepEqual(map.textSecondary.map((x) => x.name), ['--t4a6da19e16bf221a'])
  assert.equal(map.accent.length, 1)
})

test('rechner: erkannte hash variablen landen im look css', async () => {
  const { setDiscovered, hashTokenDecls } = await import('../src/appliers/hashTokens.js')
  const { extraCss } = await import('../src/registry/youtube/look.js')
  setDiscovered({ bg: [{ name: '--t3e41d7b17b187f69', alpha: 1 }, { name: '--ta889dfda9605a358', alpha: 0.8 }], text: [{ name: '--t1405e70a39276293', alpha: 1 }] })
  const decl = hashTokenDecls({ bg: '#2e3440' }, ['bg', 'text'])
  assert.deepEqual(decl, ['--t3e41d7b17b187f69: #2e3440 !important;', '--ta889dfda9605a358: color-mix(in srgb, #2e3440 80%, transparent) !important;'])
  const css = extraCss({ bg: '#2e3440', text: '#eceff4' })
  assert.match(css, /html:root:root, html:root:root \[dark\], html:root:root \[light\] \{ --t3e41d7b17b187f69: #2e3440 !important;/)
  assert.match(css, /--t1405e70a39276293: #eceff4 !important;/)
  setDiscovered({})
  assert.doesNotMatch(extraCss({ bg: '#2e3440' }), /--t3e41/)
})
