// naechtlicher prueflauf, gedacht fuer den mini-pc (tools/nightly/run.sh startet ihn per cron)
// laedt youtube, youtube mobil und music ohne anmeldung in chromium ohne bildschirm, spielt dist/ytx.min.js ein und prueft:
// 1. ytx laeuft, diagnose ohne neue fehler, pruefmodus (appCheck) meldet erwartete zustaende
// 2. selektoren aus den registries, die mehrere naechte trafen und jetzt nicht mehr (wie tools/canary.mjs)
// 3. grosse umbauten der originalseite: welche eigenen elemente (ytm-*, ytmusic-* ...) es gibt, im vergleich zur letzten nacht
// 4. neue bausteine in den youtube daten (src/registry/knownTypes.js), mit bild, und wechsel der youtube version
// meldet per ntfy nur, wenn etwas neu kaputt ist oder sich stark geaendert hat
// aufruf: node tools/nightly.mjs --state <datei> --out <ordner> [--no-notify] [--dump-types <datei>] [--tasks <datei>]
// aufgabenliste neuer bausteine: standard tasks.json neben der state datei, ablauf in docs/TRIAGE.md
// ntfy: umgebungsvariablen NTFY_URL, NTFY_TOPIC, NTFY_TOKEN (fehlen sie, wird nur der bericht geschrieben)
// voraussetzung: npm i --no-save playwright-core und ein chromium (CHROME_PATH, sonst /usr/bin/chromium)
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { collectTypes, typeTags } from '../src/core/ytTypes.js'
import { KNOWN_TYPES } from '../src/registry/knownTypes.js'
import { extractInitialData } from '../src/registry/music/initialData.js'
import { loadTasks, saveTasks, upsertTask, closeKnown } from './lib/tasks.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, def) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : def)
const STATE = resolve(arg('--state', join(root, 'check-out/nightly-state.json')))
const OUT_ROOT = resolve(arg('--out', join(root, 'check-out/nightly')))
const notify = !process.argv.includes('--no-notify')
const DUMP = arg('--dump-types', null)
const TASKS = resolve(arg('--tasks', join(dirname(STATE), 'tasks.json')))
const day = new Date().toISOString().slice(0, 10)
const OUT = join(OUT_ROOT, day)
mkdirSync(OUT, { recursive: true })

const UA_PHONE = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const PHONE = { userAgent: UA_PHONE, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 }
const DESKTOP = { userAgent: UA_DESKTOP, viewport: { width: 1280, height: 900 } }

// werbe- und spiele-kacheln muessen ausgeblendet sein (appCheck zaehlt sichtbare)
const noPromo = (r) => ['Keine Werbe- oder Spiele-Kacheln sichtbar', !r.promo?.shown?.length, r.promo?.shown?.join(', ') || `${r.promo?.hidden ?? 0} ausgeblendet`]

// app = so tun, als liefe ytx in der android-app (dort sind die app-funktionen und der pruefmodus aktiv)
const SITES = [
  { id: 'mobile', registry: 'mobile', ctx: PHONE, app: true, pages: [
    // abgemeldet und ohne verlauf zeigt die startseite keine videos, dort zaehlen nur selektoren und diagnose
    { id: 'm-home', url: 'https://m.youtube.com/', expect: (r) => [noPromo(r)] },
    { id: 'm-watch', url: 'https://m.youtube.com/watch?v=kJQP7kiw5Fk', expect: (r) => [['Player vorhanden', !!r.player, ''], ['Graph-Daten geliefert', !!r.heatmap, 'Despacito hatte bisher immer welche'], noPromo(r)] },
    { id: 'm-search', url: 'https://m.youtube.com/results?search_query=musik', expect: (r) => [['Suchergebnisse', r.feed > 0, `${r.feed} Einträge`], noPromo(r)] }
  ] },
  { id: 'music-app', registry: 'music', ctx: PHONE, app: true, pages: [
    { id: 'mm-home', url: 'https://music.youtube.com/', expect: (r) => [['Music-Layout vorhanden', r.ui !== null && r.ui !== undefined, `Zustand ${r.ui}`], ['ytx-Navigation unten sichtbar', !!r.nav?.shown, '']] },
    { id: 'mm-watch', url: 'https://music.youtube.com/watch?v=JGwWNGJdvx8', expect: (r) => [['Player öffnet', r.ui === 'PLAYER_PAGE_OPEN', `Zustand ${r.ui}`], ['Startseite im Verlauf darunter', r.history >= 2, `Verlauf ${r.history}`]] }
  ] },
  { id: 'youtube', registry: 'youtube', ctx: DESKTOP, pages: [
    { id: 'd-home', url: 'https://www.youtube.com/' },
    { id: 'd-watch', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
    { id: 'd-search', url: 'https://www.youtube.com/results?search_query=musik' }
  ] },
  { id: 'music', registry: 'music', ctx: DESKTOP, pages: [
    { id: 'd-music-home', url: 'https://music.youtube.com/' },
    { id: 'd-music-explore', url: 'https://music.youtube.com/explore' }
  ] }
]

// ab so vielen verschwundenen eigenen elementen einer seite gilt das als grosser umbau
const BIG_CHANGE = 8
// so viele naechte in folge muss ein element da gewesen sein, damit sein fehlen zaehlt
const STABLE = 3

async function selectorChecks(registry) {
  const out = []
  const t = await import(`../src/registry/${registry}/targets.js`)
  const a = await import(`../src/registry/${registry}/anchors.js`)
  for (const x of t.targets || []) out.push({ id: `target:${x.id}`, sel: [].concat(x.sel || []) })
  const anchors = Array.isArray(a.anchors) ? a.anchors : Object.entries(a.anchors || {}).map(([id, v]) => ({ id, ...v }))
  for (const x of anchors) out.push({ id: `anchor:${x.id}`, sel: [].concat(x.sel || []) })
  return out.map((c) => ({ ...c, sel: c.sel.filter((s) => !s.includes('data-ytx')) })).filter((c) => c.sel.length)
}

async function dismissConsent(page) {
  try {
    const btn = page.getByRole('button', { name: /Alle ablehnen|Reject all/i }).first()
    if (await btn.isVisible({ timeout: 2500 })) {
      await btn.click()
      await page.waitForLoadState('domcontentloaded').catch(() => {})
    }
  } catch {}
}

// alles was die seite selbst ueber ihren zustand sagt, in einem durchgang
async function probe(page, checks) {
  return page.evaluate((cs) => {
    const hits = []
    for (const c of cs) {
      for (const s of c.sel) {
        try {
          // eigene elemente von ytx zaehlen nicht, sonst trifft ein selektor nur wegen ytx
          const el = [...document.querySelectorAll(s)].find((e) => !e.closest('[data-ytx-own]'))
          if (el) {
            hits.push(c.id)
            break
          }
        } catch {}
      }
    }
    const tags = [...new Set([...document.querySelectorAll('*')].map((e) => e.localName).filter((n) => n.includes('-') && !n.startsWith('ytx')))].sort()
    const playerUrl = window.ytcfg?.get?.('PLAYER_JS_URL') || [...document.scripts].map((s) => s.src).find((s) => s.includes('/player/')) || ''
    let report = null
    let diag = null
    try {
      report = window.__ytxReport?.() || null
    } catch (e) {
      report = { error: e.message }
    }
    try {
      diag = window.__ytx?.diagnose?.() || null
    } catch (e) {
      diag = [{ id: 'diagnose', status: 'fail', detail: e.message }]
    }
    const client = window.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION') || null
    return { hits, tags, player: (playerUrl.match(/\/player\/([^/]+)\//) || [])[1] || null, client, version: window.__ytx?.version || null, report, diag }
  }, checks)
}

// startdaten der seite, music schreibt sie als initialData.push ins html
async function initialTypes(page, out) {
  const data = await page.evaluate(() => ({ d: window.ytInitialData || null, p: window.ytInitialPlayerResponse || null, m: [...document.scripts].filter((s) => !s.src && s.textContent.includes('initialData.push')).map((s) => s.textContent) }))
  collectTypes(data.d, out)
  collectTypes(data.p, out)
  for (const t of data.m) for (const b of extractInitialData(t)) collectTypes(b.data, out)
}

async function notifyNtfy(title, body, priority = 'default', tags = 'warning') {
  const { NTFY_URL, NTFY_TOPIC, NTFY_TOKEN } = process.env
  if (!notify || !NTFY_URL || !NTFY_TOPIC) return false
  const res = await fetch(`${NTFY_URL.replace(/\/$/, '')}/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: { Title: title, Priority: priority, Tags: tags, ...(NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {}) },
    body
  })
  if (!res.ok) throw new Error(`ntfy ${res.status}`)
  return true
}

// bausteine, die ytx nicht kennt: im bericht, beim ersten auftauchen als neuigkeit mit bild
async function typeCheck(page, p, site, types) {
  const reg = site.registry
  const known = new Set(KNOWN_TYPES[reg] || [])
  dump[reg] ||= new Set()
  for (const n of types.keys()) dump[reg].add(n)
  // die ersten naechte nur lernen, youtube liefert je nach lauf andere teile (werbung, endbildschirm, infokarten)
  const baseline = (prev.typeNights?.[reg] || 0) < STABLE
  const had = (next.types[reg] ||= {})
  const unknown = [...types].filter(([n]) => !known.has(n))
  if (!unknown.length) return
  lines.push(`- Noch nicht eingeordnete Bausteine: ${unknown.map(([n, par]) => `${n} (in ${par || '?'})`).join(', ')}`)
  for (const [n, par] of unknown) {
    // schon offene aufgaben als wieder gesehen vermerken
    if (tasks.some((t) => t.id === `${reg}:${n}`)) upsertTask(tasks, { site: reg, type: n, parent: par, page: p.id, day })
    if (had[n]) continue
    had[n] = day
    if (baseline) continue
    news.push(`${site.id}: ${n} (in ${par || '?'}, Seite ${p.id})`)
    const file = `${p.id}-${n}.png`
    let shot = null
    try {
      // das erste sichtbare passende element, die ersten sind oft versteckte vorlagen
      const found = await page.evaluate((sel) => {
        document.querySelector('[data-ytx-shot]')?.removeAttribute('data-ytx-shot')
        const el = [...document.querySelectorAll(sel)].find((e) => {
          const r = e.getBoundingClientRect()
          return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden'
        })
        el?.setAttribute('data-ytx-shot', '')
        return !!el
      }, typeTags(n).join(', '))
      if (found) {
        await page.locator('[data-ytx-shot]').screenshot({ path: join(OUT, file), timeout: 4000 })
        lines.push('', `Neu: ${n}`, '', `![${n}](${file})`, '')
        shot = `${day}/${file}`
      } else lines.push(`- Neu: ${n}, auf der Seite nicht sichtbar`)
    } catch {
      lines.push(`- Neu: ${n}, kein Bild möglich`)
    }
    upsertTask(tasks, { site: reg, type: n, parent: par, page: p.id, url: p.url, shot, day })
  }
}

// chromium fuehrt init-skripte aus, bevor es documentElement gibt, tampermonkey erst danach, deshalb so lange warten
const bundle = `(() => {
  const boot = () => {
${readFileSync(join(root, 'dist/ytx.min.js'), 'utf8')}
  }
  if (document.documentElement) return boot()
  const mo = new MutationObserver(() => {
    if (!document.documentElement) return
    mo.disconnect()
    boot()
  })
  mo.observe(document, { childList: true })
})()`
const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const next = { at: new Date().toISOString(), selStreak: {}, fails: {}, tagStreak: {}, player: {}, types: structuredClone(prev.types || {}), typeNights: { ...(prev.typeNights || {}) }, client: { ...(prev.client || {}) } }
const problems = []
// neue bausteine sind kein fehler, sie kommen als eigene meldung
const news = []
const dump = {}
const tasks = loadTasks(TASKS)
const notes = []
const lines = [`# ytx nächtliche Prüfung ${next.at}`, '']

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] })
try {
  for (const site of SITES) {
    const checks = await selectorChecks(site.registry)
    const ctx = await browser.newContext({ ...site.ctx, locale: 'de-DE' })
    // cookie hinweis vorab abgelehnt, sonst liegt er auf der handy seite ueber allem
    await ctx.addCookies([{ name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true }])
    if (site.app) await ctx.addInitScript(() => {
      window.__ytxNative = () => {}
      window.__ytxAppLog = () => {}
    })
    await ctx.addInitScript({ content: bundle })
    const seen = new Set()
    lines.push(`## ${site.id}`, '')
    for (const p of site.pages) {
      const page = await ctx.newPage()
      const errors = []
      const types = new Map()
      page.on('response', async (res) => {
        if (!res.url().includes('/youtubei/v1/')) return
        try {
          collectTypes(await res.json(), types)
        } catch {}
      })
      page.on('pageerror', (e) => {
        if (/ytx/i.test(String(e.stack || e.message))) errors.push(e.message.slice(0, 160))
      })
      try {
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        await dismissConsent(page)
        await page.waitForTimeout(9000)
        const r = await probe(page, checks)
        await page.screenshot({ path: join(OUT, `${p.id}.png`) }).catch(() => {})
        r.hits.forEach((h) => seen.add(h))
        lines.push(`### ${p.id} ${p.url}`, '', `- ytx ${r.version || 'NICHT GELADEN'}, Player ${r.player || '?'}, ${r.hits.length} Selektoren treffen, ${r.tags.length} eigene Elemente`)
        if (!r.version) problems.push(`${p.id}: ytx nicht geladen`)
        // diagnose: nur neue fehler melden, bekannte stehen im bericht
        const fails = (r.diag || []).filter((d) => d.status === 'fail').map((d) => `${d.id}: ${d.detail}`.slice(0, 140))
        const known = new Set(prev.fails?.[p.id] || [])
        next.fails[p.id] = fails
        for (const f of fails) {
          lines.push(`- Diagnose-Fehler: ${f}`)
          if (prev.at && !known.has(f)) problems.push(`${p.id}: neuer Diagnose-Fehler ${f}`)
        }
        if (r.diag) {
          const warn = r.diag.filter((d) => d.status === 'warn').length
          lines.push(`- Diagnose: ${r.diag.length - warn - fails.length} ok/übersprungen, ${warn} Warnungen, ${fails.length} Fehler`)
        }
        // pruefmodus
        if (p.expect) {
          if (!r.report || r.report.error) problems.push(`${p.id}: Prüfmodus ohne Antwort ${r.report?.error || ''}`)
          else for (const [label, ok, detail] of p.expect(r.report)) {
            lines.push(`- ${ok ? 'ok' : 'FEHLER'} ${label}${detail ? ` (${detail})` : ''}`)
            if (!ok) problems.push(`${p.id}: ${label}${detail ? ` (${detail})` : ''}`)
          }
        }
        for (const e of errors) {
          lines.push(`- Skriptfehler: ${e}`)
          problems.push(`${p.id}: Skriptfehler ${e}`)
        }
        // umbau der originalseite: youtube testet staendig varianten, deshalb zaehlen nur elemente, die mehrere naechte in folge da waren
        const streak = prev.tagStreak?.[p.id] || {}
        next.tagStreak[p.id] = Object.fromEntries(r.tags.map((t) => [t, (streak[t] || 0) + 1]))
        const gone = Object.keys(streak).filter((t) => streak[t] >= STABLE && !r.tags.includes(t))
        const added = r.tags.filter((t) => !(t in streak))
        if (gone.length) lines.push(`- Feste Elemente weg: ${gone.join(', ')}`)
        if (added.length && Object.keys(streak).length) lines.push(`- Neue Elemente: ${added.join(', ')}`)
        if (gone.length >= BIG_CHANGE) problems.push(`${p.id}: großer Umbau, ${gone.length} feste Elemente weg (${gone.slice(0, 5).join(', ')} …)`)
        else if (gone.length) notes.push(`${p.id}: ${gone.length} feste Elemente weg (${gone.join(', ')})`)
        next.player[p.id] = r.player
        if (r.client && next.client[site.registry] !== r.client) {
          if (next.client[site.registry]) notes.push(`${site.id}: YouTube-Version ${next.client[site.registry]} → ${r.client}`)
          next.client[site.registry] = r.client
        }
        // weiterscrollen, damit nachgeladene regale mitzaehlen
        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, 2500)
          await page.waitForTimeout(1500)
        }
        await initialTypes(page, types)
        await typeCheck(page, p, site, types)
      } catch (e) {
        lines.push(`### ${p.id}`, '', `- Laden fehlgeschlagen: ${e.message.split('\n')[0]}`)
        problems.push(`${p.id}: Laden fehlgeschlagen`)
      }
      lines.push('', `![${p.id}](${p.id}.png)`, '')
      await page.close()
    }
    await ctx.close()
    // selektoren, die mehrere naechte in folge trafen und jetzt nirgends mehr (manche treffen je nach testgruppe nur zeitweise)
    const streak = prev.selStreak?.[site.id] || {}
    if (seen.size >= Math.max(5, Object.keys(streak).length * 0.3)) {
      for (const id of Object.keys(streak)) if (streak[id] >= STABLE && !seen.has(id)) problems.push(`${site.id}: Selektor ${id} trifft nicht mehr`)
      next.selStreak[site.id] = Object.fromEntries([...seen].map((id) => [id, (streak[id] || 0) + 1]))
    } else {
      problems.push(`${site.id}: nur ${seen.size} Selektoren getroffen, Seiten nicht richtig geladen`)
      next.selStreak[site.id] = streak
    }
  }
} finally {
  await browser.close()
}

for (const reg of Object.keys(dump)) next.typeNights[reg] = (prev.typeNights?.[reg] || 0) + 1
// eingetragene bausteine schliessen ihre aufgabe
closeKnown(tasks, KNOWN_TYPES, day)
mkdirSync(dirname(TASKS), { recursive: true })
saveTasks(TASKS, tasks)
const open = tasks.filter((t) => t.status === 'offen' || t.status === 'unklar').length
if (open) notes.push(`${open} offene Aufgaben zu neuen Bausteinen, siehe ${join(dirname(TASKS), 'tasks.md')}`)

lines.splice(2, 0, problems.length ? `**${problems.length} Probleme**` : '**Alles ok**', '', ...problems.map((p) => `- ${p}`), ...(news.length ? ['', 'Neu bei YouTube (in src/registry/knownTypes.js eintragen, wenn eingeordnet):', ...news.map((n) => `- ${n}`)] : []), ...(notes.length ? ['', 'Hinweise:', ...notes.map((n) => `- ${n}`)] : []), '')
writeFileSync(join(OUT, 'report.md'), lines.join('\n'))
mkdirSync(dirname(STATE), { recursive: true })
writeFileSync(STATE, JSON.stringify(next, null, 2))

// alte berichte nach 30 tagen loeschen
for (const d of readdirSync(OUT_ROOT)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)) rmSync(join(OUT_ROOT, d), { recursive: true, force: true })

if (DUMP) writeFileSync(resolve(DUMP), JSON.stringify(Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, [...v].sort()])), null, 1))

console.log(lines.slice(0, 4 + problems.length + news.length + notes.length + 5).join('\n'))
console.log(`Bericht: ${join(OUT, 'report.md')}`)
if (news.length) {
  const body = [...news.slice(0, 12), news.length > 12 ? `… und ${news.length - 12} weitere` : '', `Bericht mit Bildern: ${join(OUT, 'report.md')}`, `Aufgaben: ${join(dirname(TASKS), 'tasks.md')}`].filter(Boolean).join('\n')
  try {
    if (await notifyNtfy(`ytx: ${news.length} neue Bausteine bei YouTube`, body, 'low', 'mag')) console.log('ntfy neuigkeiten gesendet')
  } catch (e) {
    console.error(`ntfy fehlgeschlagen: ${e.message}`)
  }
}
if (problems.length) {
  const body = [...problems.slice(0, 12), problems.length > 12 ? `… und ${problems.length - 12} weitere` : '', `Bericht: ${join(OUT, 'report.md')}`].filter(Boolean).join('\n')
  try {
    if (await notifyNtfy(`ytx: ${problems.length} Probleme in der Nacht`, body)) console.log('ntfy gesendet')
  } catch (e) {
    console.error(`ntfy fehlgeschlagen: ${e.message}`)
  }
  // 3 = probleme gefunden und gemeldet, ein absturz endet mit 1 (run.sh meldet den selbst)
  process.exitCode = 3
}
