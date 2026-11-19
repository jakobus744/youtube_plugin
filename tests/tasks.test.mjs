import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upsertTask, closeKnown, decide, harmlessTypes, renderMd } from '../tools/lib/tasks.mjs'

test('Aufgabe anlegen und wieder sehen', () => {
  const tasks = []
  upsertTask(tasks, { site: 'mobile', type: 'fooViewModel', parent: 'richShelfRenderer', page: 'm-home', day: '2026-11-20' })
  upsertTask(tasks, { site: 'mobile', type: 'fooViewModel', page: 'm-search', shot: '2026-11-21/x.png', day: '2026-11-21' })
  upsertTask(tasks, { site: 'mobile', type: 'fooViewModel', page: 'm-search', day: '2026-11-21' })
  assert.equal(tasks.length, 1)
  assert.deepEqual(tasks[0].pages, ['m-home', 'm-search'])
  assert.equal(tasks[0].seen, 2)
  assert.equal(tasks[0].shot, '2026-11-21/x.png')
  assert.equal(tasks[0].status, 'offen')
})

test('Entscheiden, exportieren, über die Bekannt-Liste schließen', () => {
  const tasks = []
  upsertTask(tasks, { site: 'mobile', type: 'aViewModel', day: 'd' })
  upsertTask(tasks, { site: 'youtube', type: 'bRenderer', day: 'd' })
  assert.equal(decide(tasks, 'aViewModel', 'harmlos', 'knopf im player', 'jakob', 'd2'), 1)
  assert.throws(() => decide(tasks, 'bRenderer', 'egal', '', 'x', 'd2'))
  assert.deepEqual(harmlessTypes(tasks), { mobile: ['aViewModel'] })
  assert.equal(closeKnown(tasks, { mobile: ['aViewModel'] }, 'd3'), 1)
  assert.equal(tasks[0].status, 'erledigt')
  assert.match(renderMd(tasks), /## offen \(1\)/)
})
