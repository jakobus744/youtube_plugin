// Selbsttest: oeffnet YouTube Seiten ohne Anmeldung und prueft, ob die Selektoren von ytx noch Treffer haben
// ein Selektor, der frueher traf und jetzt nirgends mehr, ist ein Hinweis auf einen Umbau bei YouTube
// Aufruf: node tools/canary.mjs [--update]     (--update schreibt tools/canary-baseline.json neu)
// Voraussetzung: npm i --no-save playwright-core, dazu ein Chrome (CHROME_PATH) oder `npx playwright-core install chromium`
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = resolve(root, 'tools/canary-baseline.json')
const update = process.argv.includes('--update')

const UA_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const SITES = {
  mobile: {
    ua: UA_PHONE,
    viewport: { width: 412, height: 915 },
    pages: ['https://m.youtube.com/', 'https://m.youtube.com/results?search_query=musik', 'https://m.youtube.com/watch?v=jNQXAC9IVRw', 'https://m.youtube.com/@YouTube']
  },
  youtube: {
    ua: UA_DESKTOP,
    viewport: { width: 1280, height: 900 },
    pages: ['https://www.youtube.com/', 'https://www.youtube.com/results?search_query=musik', 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/@YouTube']
  },
  music: {
    ua: UA_DESKTOP,
    viewport: { width: 1280, height: 900 },
    pages: ['https://music.youtube.com/', 'https://music.youtube.com/explore']
  }
}

// Selektoren aus den Registries, eigene Markierungen (data-ytx) gibt es auf der rohen Seite noch nicht
async function checksFor(site) {
  const out = []
  const t = await import(`../src/registry/${site === 'mobile' ? 'mobile' : site}/targets.js`)
  const a = await import(`../src/registry/${site === 'mobile' ? 'mobile' : site}/anchors.js`)
  for (const x of t.targets || []) out.push({ id: `target:${x.id}`, sel: [].concat(x.sel || []) })
  const anchors = Array.isArray(a.anchors) ? a.anchors : Object.entries(a.anchors || {}).map(([id, v]) => ({ id, ...v }))
  for (const x of anchors) out.push({ id: `anchor:${x.id}`, sel: [].concat(x.sel || []) })
  return out.map((c) => ({ ...c, sel: c.sel.filter((s) => !s.includes('data-ytx')) })).filter((c) => c.sel.length)
}

async function dismissConsent(page) {
  try {
    const btn = page.getByRole('button', { name: /Alle ablehnen|Reject all/i }).first()
    if (await btn.isVisible({ timeout: 1500 })) await btn.click()
  } catch {}
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true })
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {}
const next = {}
const regressions = []

for (const [site, cfg] of Object.entries(SITES)) {
  const checks = await checksFor(site)
  const ctx = await browser.newContext({ userAgent: cfg.ua, viewport: cfg.viewport, locale: 'de-DE' })
  const seen = new Set()
  for (const url of cfg.pages) {
    const page = await ctx.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await dismissConsent(page)
      await page.waitForTimeout(7000)
      const hits = await page.evaluate((cs) => {
        const ok = []
        for (const c of cs) {
          for (const s of c.sel) {
            try {
              if (document.querySelector(s)) {
                ok.push(c.id)
                break
              }
            } catch {}
          }
        }
        return ok
      }, checks)
      hits.forEach((h) => seen.add(h))
      console.log(`${site.padEnd(8)} ${url.slice(0, 60).padEnd(60)} ${hits.length} Treffer`)
    } catch (e) {
      console.log(`${site.padEnd(8)} ${url.slice(0, 60).padEnd(60)} Fehler: ${e.message.split('\n')[0]}`)
    }
    await page.close()
  }
  await ctx.close()
  const before = new Set(base[site]?.seen || [])
  const lost = [...before].filter((id) => !seen.has(id))
  // nur wenn die Seiten ueberhaupt geladen wurden (sonst waere jeder Selektor "verschwunden")
  if (seen.size >= Math.max(5, before.size * 0.3)) regressions.push(...lost.map((id) => `${site}: ${id}`))
  else console.log(`${site}: zu wenige Treffer (${seen.size}), Vergleich übersprungen`)
  next[site] = { seen: [...new Set([...before, ...seen])].sort(), checks: checks.length }
}
await browser.close()

if (update) {
  writeFileSync(BASE, JSON.stringify(next, null, 2) + '\n')
  console.log('Basis geschrieben')
}
if (regressions.length) {
  console.log(`\n${regressions.length} Selektoren ohne Treffer, die früher getroffen haben:`)
  regressions.forEach((r) => console.log(`- ${r}`))
  process.exitCode = 1
} else console.log('\nKeine Regression')
