// traegt bausteine in src/registry/knownTypes.js ein, wenn sie eingeordnet sind
// aufruf: node tools/known-types.mjs <types.json> [weitere.json]
// json: { "mobile": ["fooRenderer", ...], "youtube": [...], "music": [...] }
// solche dateien schreiben der nachtlauf (--dump-types) und das pruefskript am handy (check-out/<zeit>/types.json)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KNOWN_TYPES } from '../src/registry/knownTypes.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'src/registry/knownTypes.js')
const files = process.argv.slice(2)
if (!files.length) {
  console.error('aufruf: node tools/known-types.mjs <types.json> [weitere.json]')
  process.exit(1)
}

const sets = Object.fromEntries(['youtube', 'mobile', 'music'].map((k) => [k, new Set(KNOWN_TYPES[k] || [])]))
const added = {}
for (const f of files) {
  const j = JSON.parse(readFileSync(resolve(f), 'utf8'))
  for (const [site, names] of Object.entries(j)) {
    if (!sets[site]) continue
    for (const n of names) {
      if (!/^[a-z][A-Za-z0-9]*(Renderer|ViewModel)$/.test(n) || sets[site].has(n)) continue
      sets[site].add(n)
      ;(added[site] ||= []).push(n)
    }
  }
}

// zeilen von hoechstens 110 zeichen, damit diffs lesbar bleiben
function list(names) {
  const out = []
  let line = ''
  for (const n of [...names].sort()) {
    const item = `'${n}',`
    if (line && line.length + item.length + 1 > 106) {
      out.push(line)
      line = ''
    }
    line += (line ? ' ' : '') + item
  }
  if (line) out.push(line)
  return out.map((l) => `    ${l}`).join('\n').replace(/,$/, '')
}

const src = readFileSync(file, 'utf8')
const head = src.slice(0, src.indexOf('export const KNOWN_TYPES'))
const body = Object.entries(sets).map(([k, v]) => `  ${k}: [${v.size ? `\n${list(v)}\n  ` : ''}]`).join(',\n')
writeFileSync(file, `${head}export const KNOWN_TYPES = {\n${body}\n}\n`)
for (const [k, v] of Object.entries(added)) console.log(`${k}: ${v.length} neu eingetragen`)
if (!Object.keys(added).length) console.log('nichts neu')
