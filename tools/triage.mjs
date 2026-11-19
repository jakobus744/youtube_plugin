// neue youtube bausteine einordnen, ablauf in docs/TRIAGE.md
// node tools/triage.mjs [--tasks <datei>] list [--all]
// node tools/triage.mjs [--tasks <datei>] set <baustein|seite:baustein> <offen|harmlos|werbung|regal|unklar> [notiz] [--by name]
// node tools/triage.mjs [--tasks <datei>] export [datei]      harmlose als types.json fuer tools/known-types.mjs
// node tools/triage.mjs [--tasks <datei>] import <types.json> [--from handy]  z. b. aus der handy-pruefung (check-out/<zeit>/types.json)
// ohne --tasks: ~/ytx-nightly/tasks.json, wenn vorhanden (mini-pc), sonst check-out/tasks.json
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STATUS, loadTasks, saveTasks, decide, harmlessTypes, upsertTask, closeKnown } from './lib/tasks.mjs'
import { KNOWN_TYPES } from '../src/registry/knownTypes.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  if (i < 0) return null
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const flag = (name) => {
  const i = args.indexOf(name)
  if (i >= 0) args.splice(i, 1)
  return i >= 0
}
const mini = join(homedir(), 'ytx-nightly/tasks.json')
const file = resolve(opt('--tasks') || (existsSync(mini) ? mini : join(root, 'check-out/tasks.json')))
const by = opt('--by') || 'jakob'
const from = opt('--from') || 'handy'
const all = flag('--all')
const [cmd, ...rest] = args
const day = new Date().toISOString().slice(0, 10)
const tasks = loadTasks(file)

if (cmd === 'list' || !cmd) {
  closeKnown(tasks, KNOWN_TYPES, day)
  const list = tasks.filter((t) => all || t.status !== 'erledigt')
  if (!list.length) console.log(`keine offenen aufgaben (${file})`)
  for (const t of list) console.log(`${t.status.padEnd(8)} ${t.id}  in ${t.parent || '?'}  seiten ${t.pages.join(',') || '?'}  seit ${t.first}${t.note ? `  notiz: ${t.note}` : ''}`)
} else if (cmd === 'set') {
  const [ref, status, ...note] = rest
  if (!ref || !status) throw new Error(`aufruf: set <baustein> <${Object.keys(STATUS).join('|')}> [notiz]`)
  const n = decide(tasks, ref, status, note.join(' '), by, day)
  if (!n) throw new Error(`keine aufgabe ${ref}`)
  saveTasks(file, tasks)
  console.log(`${n} aufgabe(n) auf ${status}`)
} else if (cmd === 'export') {
  const out = JSON.stringify(harmlessTypes(tasks), null, 1)
  if (rest[0]) writeFileSync(resolve(rest[0]), out)
  else console.log(out)
} else if (cmd === 'import') {
  if (!rest[0]) throw new Error('aufruf: import <types.json>')
  const j = JSON.parse(readFileSync(resolve(rest[0]), 'utf8'))
  let n = 0
  for (const [site, names] of Object.entries(j)) {
    for (const type of names) {
      if ((KNOWN_TYPES[site] || []).includes(type)) continue
      upsertTask(tasks, { site, type, page: from, day, source: from })
      n++
    }
  }
  mkdirSync(dirname(file), { recursive: true })
  saveTasks(file, tasks)
  console.log(`${n} bausteine übernommen`)
} else {
  throw new Error(`unbekannter befehl ${cmd}, erlaubt: list, set, export, import`)
}
