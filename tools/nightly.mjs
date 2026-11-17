// naechtlicher prueflauf, gedacht fuer den mini-pc (tools/nightly/run.sh startet ihn per cron)
// laedt youtube, youtube mobil und music ohne anmeldung in chromium ohne bildschirm, spielt dist/ytx.min.js ein und prueft:
// 1. ytx laeuft, diagnose ohne neue fehler, pruefmodus (appCheck) meldet erwartete zustaende
// 2. selektoren aus den registries, die mehrere naechte trafen und jetzt nicht mehr (wie tools/canary.mjs)
// 3. grosse umbauten der originalseite: welche eigenen elemente (ytm-*, ytmusic-* ...) es gibt, im vergleich zur letzten nacht
// meldet per ntfy nur, wenn etwas neu kaputt ist oder sich stark geaendert hat
// aufruf: node tools/nightly.mjs --state <datei> --out <ordner> [--no-notify]
// ntfy: umgebungsvariablen NTFY_URL, NTFY_TOPIC, NTFY_TOKEN (fehlen sie, wird nur der bericht geschrieben)
// voraussetzung: npm i --no-save playwright-core und ein chromium (CHROME_PATH, sonst /usr/bin/chromium)
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, def) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : def)
const STATE = resolve(arg('--state', join(root, 'check-out/nightly-state.json')))
const OUT_ROOT = resolve(arg('--out', join(root, 'check-out/nightly')))
const notify = !process.argv.includes('--no-notify')
const day = new Date().toISOString().slice(0, 10)
const OUT = join(OUT_ROOT, day)
mkdirSync(OUT, { recursive: true })

const UA_PHONE = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const PHONE = { userAgent: UA_PHONE, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 }
const DESKTOP = { userAgent: UA_DESKTOP, viewport: { width: 1280, height: 900 } }

// app = so tun, als liefe ytx in der android-app (dort sind die app-funktionen und der pruefmodus aktiv)
const SITES = [
  { id: 'mobile', registry: 'mobile', ctx: PHONE, app: true, pages: [
    // abgemeldet und ohne verlauf zeigt die startseite keine videos, dort zaehlen nur selektoren und diagnose
    { id: 'm-home', url: 'https://m.youtube.com/' },
    { id: 'm-watch', url: 'https://m.youtube.com/watch?v=kJQP7kiw5Fk', expect: (r) => [['Player vorhanden', !!r.player, ''], ['Graph-Daten geliefert', !!r.heatmap, 'Despacito hatte bisher immer welche']] },
    { id: 'm-search', url: 'https://m.youtube.com/results?search_query=musik', expect: (r) => [['Suchergebnisse', r.feed > 0, `${r.feed} Einträge`]] }
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
    return { hits, tags, player: (playerUrl.match(/\/player\/([^/]+)\//) || [])[1] || null, version: window.__ytx?.version || null, report, diag }
  }, checks)
}

async function notifyNtfy(title, body, priority = 'default') {
  const { NTFY_URL, NTFY_TOPIC, NTFY_TOKEN } = process.env
  if (!notify || !NTFY_URL || !NTFY_TOPIC) return false
  const res = await fetch(`${NTFY_URL.replace(/\/$/, '')}/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: { Title: title, Priority: priority, Tags: 'warning', ...(NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {}) },
    body
  })
  if (!res.ok) throw new Error(`ntfy ${res.status}`)
  return true
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
const next = { at: new Date().toISOString(), selStreak: {}, fails: {}, tagStreak: {}, player: {} }
const problems = []
const notes = []
const lines = [`# ytx nächtliche Prüfung ${next.at}`, '']

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] })
try {
  for (const site of SITES) {
    const checks = await selectorChecks(site.registry)
    const ctx = await browser.newContext({ ...site.ctx, locale: 'de-DE' })
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

lines.splice(2, 0, problems.length ? `**${problems.length} Probleme**` : '**Alles ok**', '', ...problems.map((p) => `- ${p}`), ...(notes.length ? ['', 'Hinweise:', ...notes.map((n) => `- ${n}`)] : []), '')
writeFileSync(join(OUT, 'report.md'), lines.join('\n'))
mkdirSync(dirname(STATE), { recursive: true })
writeFileSync(STATE, JSON.stringify(next, null, 2))

// alte berichte nach 30 tagen loeschen
for (const d of readdirSync(OUT_ROOT)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)) rmSync(join(OUT_ROOT, d), { recursive: true, force: true })

console.log(lines.slice(0, 4 + problems.length + notes.length + 3).join('\n'))
console.log(`Bericht: ${join(OUT, 'report.md')}`)
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
