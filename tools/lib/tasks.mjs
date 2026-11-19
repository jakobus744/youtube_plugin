// aufgabenliste fuer neue youtube bausteine, eine aufgabe je seite und baustein
// heute entscheidet ein mensch (oder claude in einer sitzung), spaeter ein agent auf dem mini-pc, siehe docs/TRIAGE.md
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// offen = noch nicht angesehen, erledigt = steht in src/registry/knownTypes.js
export const STATUS = {
  offen: 'noch nicht eingeordnet',
  harmlos: 'harmlos, in die Bekannt-Liste eintragen',
  werbung: 'Werbung, braucht eine Ausblend-Regel',
  regal: 'neues Regal oder Seitenteil, Regel oder Funktion prüfen',
  unklar: 'unklar, Jakob fragen',
  erledigt: 'in der Bekannt-Liste, Aufgabe abgeschlossen'
}

export const taskId = (site, type) => `${site}:${type}`

export function loadTasks(file) {
  if (!existsSync(file)) return []
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(j.tasks) ? j.tasks : []
  } catch {
    return []
  }
}

// neu anlegen oder als wieder gesehen vermerken
export function upsertTask(tasks, { site, type, parent = '', page = '', url = '', shot = null, day, source = 'nachtlauf' }) {
  const id = taskId(site, type)
  let t = tasks.find((x) => x.id === id)
  if (!t) {
    t = { id, site, type, parent, pages: [], url, first: day, last: day, seen: 0, shot, source, status: 'offen', note: '', decided: null, by: null }
    tasks.push(t)
  }
  if (page && !t.pages.includes(page)) t.pages.push(page)
  if (t.last !== day || !t.seen) t.seen++
  t.last = day
  if (!t.shot && shot) t.shot = shot
  if (!t.parent && parent) t.parent = parent
  return t
}

// was inzwischen in der bekannt-liste steht, ist erledigt
export function closeKnown(tasks, known, day) {
  let n = 0
  for (const t of tasks) {
    if (t.status === 'erledigt' || !(known[t.site] || []).includes(t.type)) continue
    t.status = 'erledigt'
    t.decided ||= day
    t.by ||= 'knownTypes'
    n++
  }
  return n
}

export function decide(tasks, ref, status, note, by, day) {
  if (!STATUS[status]) throw new Error(`unbekannter status ${status}, erlaubt: ${Object.keys(STATUS).join(', ')}`)
  const hits = tasks.filter((t) => t.id === ref || t.type === ref)
  for (const t of hits) {
    t.status = status
    if (note) t.note = note
    t.decided = day
    t.by = by
  }
  return hits.length
}

// harmlose im format von tools/known-types.mjs
export function harmlessTypes(tasks) {
  const out = {}
  for (const t of tasks) if (t.status === 'harmlos') (out[t.site] ||= []).push(t.type)
  return out
}

export function renderMd(tasks) {
  const lines = ['# ytx: neue YouTube-Bausteine', '', `Stand ${new Date().toISOString()}. Ablauf in docs/TRIAGE.md im ytx-Repo.`, '']
  for (const status of Object.keys(STATUS)) {
    const list = tasks.filter((t) => t.status === status)
    if (!list.length || status === 'erledigt') continue
    lines.push(`## ${status} (${list.length}): ${STATUS[status]}`, '')
    for (const t of list.sort((a, b) => (a.first < b.first ? 1 : -1))) {
      lines.push(`- **${t.type}** (${t.site}, in ${t.parent || '?'}), Seiten ${t.pages.join(', ') || '?'}, seit ${t.first}, ${t.seen}× gesehen${t.shot ? `, Bild reports/${t.shot}` : ''}${t.note ? `. Notiz: ${t.note}` : ''}`)
    }
    lines.push('')
  }
  const done = tasks.filter((t) => t.status === 'erledigt').length
  if (done) lines.push(`${done} erledigt.`)
  return lines.join('\n')
}

export function saveTasks(file, tasks) {
  writeFileSync(file, JSON.stringify({ version: 1, tasks }, null, 1))
  writeFileSync(join(dirname(file), 'tasks.md'), renderMd(tasks))
}
