import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merge3 } from '../src/core/merge.js'
import { clampRect, defaultRect } from '../src/panel/geometry.js'
import { matches, norm } from '../src/features/youtube/playlist/search.js'
import { GENRE_GROUPS, ALL_GENRES } from '../src/features/music/logic/genres.js'

test('merge: youtube und music tab aendern verschiedene abschnitte', () => {
  const base = { active: 'a', profiles: { a: { name: 'A', config: { youtube: { vars: { bg: '#111' } }, music: { vars: {} } } } }, settings: { hotkeys: {} } }
  const ours = structuredClone(base)
  ours.profiles.a.config.music.vars.bg = '#222'
  const theirs = structuredClone(base)
  theirs.profiles.a.config.youtube.vars.bg = '#333'
  theirs.settings.panelTab = 'look'
  const m = merge3(base, ours, theirs)
  assert.equal(m.profiles.a.config.youtube.vars.bg, '#333')
  assert.equal(m.profiles.a.config.music.vars.bg, '#222')
  assert.equal(m.settings.panelTab, 'look')
})

test('merge: loeschen, neue profile, konflikt gewinnt eigene seite', () => {
  const base = { active: 'a', profiles: { a: { name: 'A' }, b: { name: 'B' } } }
  const ours = { active: 'a', profiles: { a: { name: 'A2' } } }
  const theirs = { active: 'c', profiles: { a: { name: 'A3' }, b: { name: 'B' }, c: { name: 'C' } } }
  const m = merge3(base, ours, theirs)
  assert.equal(m.active, 'c')
  assert.equal(m.profiles.b, undefined)
  assert.equal(m.profiles.c.name, 'C')
  assert.equal(m.profiles.a.name, 'A2')
})

test('panel bleibt im sichtbaren bereich', () => {
  const d = defaultRect(1920, 1080)
  assert.deepEqual(d, { left: 1468, top: 64, width: 440, height: 1004 })
  assert.deepEqual(clampRect({ left: 5000, top: -40, width: 440, height: 900 }, 1280, 720), { left: 832, top: 8, width: 440, height: 704 })
  assert.deepEqual(clampRect({ left: 10, top: 10, width: 100, height: 50 }, 1280, 720), { left: 10, top: 10, width: 300, height: 220 })
  // sehr kleines fenster
  const tiny = clampRect({ left: 0, top: 0, width: 440, height: 800 }, 280, 200)
  assert.ok(tiny.width <= 264 && tiny.height <= 184)
})

test('playlist suche nach titel und kanal', () => {
  const it = { title: 'Café del Mar – Ibiza Mix 2024', channel: 'Chillout Lounge' }
  assert.ok(matches(it, ''))
  assert.ok(matches(it, 'cafe'))
  assert.ok(matches(it, 'IBIZA lounge'))
  assert.ok(!matches(it, 'ibiza techno'))
  assert.equal(norm('Ärger ÉCOLE'), 'arger ecole')
})

test('genre liste ohne doppelte', () => {
  assert.ok(GENRE_GROUPS.length >= 4)
  assert.equal(new Set(ALL_GENRES).size, ALL_GENRES.length)
  for (const g of ['Hard Techno', 'Hardstyle', 'Rawstyle', 'Frenchcore', 'Drill', 'Boom Bap', 'Phonk']) assert.ok(ALL_GENRES.includes(g), g)
})
