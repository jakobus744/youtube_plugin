// pruefskript fuer die ytx-app am handy: steuert das handy per adb, liest den pruefmodus der seite aus und macht screenshots
// aufruf: node tools/phone-check.mjs [--only youtube|music]
// voraussetzung: handy per usb verbunden, usb-debugging an, aktuelle ytx-apk installiert, handy entsperrt und frei
// achtung: beendet die ytx-app einmal (force-stop) und spielt kurz videos und musik ab, am ende wird pausiert
// adb: umgebungsvariable ADB, sonst das android sdk unter %LOCALAPPDATA%, sonst adb aus dem PATH
// ergebnis: check-out/<zeit>/report.md mit screenshots daneben
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = 'io.github.jakobus744.ytx'
const YT = `${PKG}/.MainActivity`
const MUSIC = `${PKG}/.MusicActivity`

const sdkAdb = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe') : ''
const ADB = process.env.ADB || (sdkAdb && existsSync(sdkAdb) ? sdkAdb : 'adb')
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const out = join(root, 'check-out', stamp)
mkdirSync(out, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const adb = (args, opts = {}) => execFileSync(ADB, args, { maxBuffer: 64 * 1024 * 1024, ...opts })
const sh = (cmd) => adb(['shell', cmd]).toString()

function shot(name) {
  const file = `${name}.png`
  writeFileSync(join(out, file), adb(['exec-out', 'screencap', '-p']))
  return file
}

// letzte meldung des pruefmodus seit dem letzten leeren des logs
function lastReport() {
  const lines = sh('logcat -d -s ytx-page').split('\n').filter((l) => l.includes('YTXCHECK '))
  const line = lines.at(-1)
  if (!line) return null
  try {
    return JSON.parse(line.slice(line.indexOf('YTXCHECK ') + 9))
  } catch {
    return null
  }
}

async function freshReport(waitMs) {
  sh('logcat -c')
  const end = Date.now() + waitMs
  let r = null
  while (Date.now() < end) {
    await sleep(1000)
    r = lastReport() || r
  }
  return r
}

const topActivity = () => (sh('dumpsys activity activities').split('\n').find((l) => l.includes('topResumedActivity')) || '').trim()
const open = (activity, url) => sh(`am start -n ${activity} -a android.intent.action.VIEW -d '${url}'`)
const back = () => sh('input keyevent 4')

const results = []
let current = null

function scenario(name) {
  current = { name, checks: [], shots: [], notes: [] }
  results.push(current)
  console.log(`\n# ${name}`)
}

// muss = fehler wenn falsch, info = nur vermerkt
function expect(label, ok, detail = '', level = 'muss') {
  const status = ok ? 'ok' : level === 'muss' ? 'FEHLER' : 'hinweis'
  current.checks.push({ label, status, detail })
  console.log(`  ${status.padEnd(7)} ${label}${detail ? ` (${detail})` : ''}`)
}

const note = (text) => {
  current.notes.push(text)
  console.log(`  - ${text}`)
}

async function youtube() {
  scenario('YouTube: Startseite')
  open(YT, 'https://m.youtube.com/#ytxcheck')
  let r = await freshReport(12000)
  current.shots.push(shot('yt-home'))
  expect('Prüfmodus meldet sich', !!r, r ? '' : 'keine YTXCHECK-Zeile, ist die aktuelle APK installiert?')
  if (r) {
    expect('Videos in der Startseite', r.feed > 0, `${r.feed} Einträge`, 'info')
    if (r.diag) note(`Diagnose: ${r.diag.ok} ok, ${r.diag.warn} Warnungen, ${r.diag.fail} Fehler`)
  }

  scenario('YouTube: Video')
  open(YT, 'https://m.youtube.com/watch?v=kJQP7kiw5Fk#ytxcheck')
  r = await freshReport(12000)
  if (r?.media?.paused) {
    sh('input keyevent 126')
    r = await freshReport(4000)
  }
  current.shots.push(shot('yt-watch'))
  expect('Player sichtbar', !!r?.player?.shown, r?.player ? `y ${r.player.y}, Höhe ${r.player.h}` : 'kein #movie_player')
  const t1 = r?.media?.t ?? null
  const r2 = await freshReport(4000)
  const t2 = r2?.media?.t ?? null
  expect('Video läuft', t1 != null && t2 != null && t2 > t1, `${t1} s → ${t2} s`)
  expect('Graph-Daten vorhanden', !!r2?.heatmap, r2?.heatmap ? '' : 'keine heatmap in den Seitendaten', 'info')
  if (r?.adWait || r2?.adWait) note('Countdown nach geblockter Werbung wurde angezeigt')
  sh('input keyevent 127')
}

async function music() {
  scenario('Music: Start direkt im Player')
  sh(`am force-stop ${PKG}`)
  await sleep(800)
  open(MUSIC, 'https://music.youtube.com/watch?v=JGwWNGJdvx8#ytxcheck')
  let r = await freshReport(15000)
  current.shots.push(shot('music-player'))
  expect('Prüfmodus meldet sich', !!r, r ? '' : 'keine YTXCHECK-Zeile')
  expect('Player offen', r?.ui === 'PLAYER_PAGE_OPEN', `Zustand ${r?.ui}`)
  expect('Startseite liegt im Verlauf darunter', !!r && r.history >= 2, `Verlauf ${r?.history}`)
  expect('Titel/Video-Umschalter sichtbar', !!r?.avToggle?.shown, 'nur angemeldet erwartet', 'info')
  if (r?.diag) note(`Diagnose: ${r.diag.ok} ok, ${r.diag.warn} Warnungen, ${r.diag.fail} Fehler`)

  scenario('Music: Zurück klappt zu')
  back()
  r = await freshReport(3500)
  current.shots.push(shot('music-back1'))
  expect('Player zugeklappt', r?.ui === 'PLAYER_BAR_ONLY', `Zustand ${r?.ui}`)
  expect('Startseite', r?.path === '/', `Pfad ${r?.path}`)
  expect('Leiste unten sichtbar und frei', !!r?.bar?.shown, r?.bar ? `y ${r.bar.y}, Höhe ${r.bar.h}${r.bar.cover ? `, verdeckt von ${r.bar.cover}` : ''}` : 'keine Leiste')
  expect('Navigation unten sichtbar', !!r?.nav?.shown)
  expect('Musik läuft weiter', r?.media && !r.media.paused, r?.media ? `${r.media.t} s` : 'kein Medium')
  if (r?.bar && r?.nav) expect('Leiste über der Navigation', r.bar.y + r.bar.h <= r.nav.y + 1, `Leiste endet ${r.bar.y + r.bar.h}, Navigation beginnt ${r.nav.y}`)

  scenario('Music: Zurück verlässt die App')
  back()
  await sleep(2500)
  current.shots.push(shot('music-back2'))
  const top = topActivity()
  expect('App im Hintergrund', !top.includes(PKG), top.replace(/^.*\{/, '').slice(0, 80))

  scenario('Music: wieder öffnen')
  sh(`am start -n ${MUSIC}`)
  r = await freshReport(4000)
  current.shots.push(shot('music-again'))
  expect('Leiste unten sichtbar und frei', !!r?.bar?.shown, r?.bar ? `y ${r.bar.y}` : 'keine Meldung oder keine Leiste')
  sh('input keyevent 127')
}

function writeReport() {
  const lines = [`# ytx Prüfung ${stamp}`, '', `Gerät: ${sh('getprop ro.product.model').trim()}, Android ${sh('getprop ro.build.version.release').trim()}`, '']
  let fails = 0
  for (const s of results) {
    lines.push(`## ${s.name}`, '')
    for (const c of s.checks) {
      if (c.status === 'FEHLER') fails++
      lines.push(`- **${c.status}** ${c.label}${c.detail ? `: ${c.detail}` : ''}`)
    }
    for (const n of s.notes) lines.push(`- ${n}`)
    for (const f of s.shots) lines.push('', `![${f}](${f})`)
    lines.push('')
  }
  lines.splice(2, 0, fails ? `**${fails} Fehler**` : '**Alles ok**', '')
  writeFileSync(join(out, 'report.md'), lines.join('\n'))
  return fails
}

try {
  if (!adb(['devices']).toString().split('\n').slice(1).some((l) => /\tdevice/.test(l))) throw new Error('kein Handy per adb erreichbar')
  if (!only || only === 'youtube') await youtube()
  if (!only || only === 'music') await music()
} catch (e) {
  console.error(`\nAbbruch: ${e.message}`)
  if (current) current.notes.push(`Abbruch: ${e.message}`)
} finally {
  try {
    sh('input keyevent 127')
  } catch {}
}
const fails = writeReport()
console.log(`\n${fails ? `${fails} Fehler` : 'Alles ok'} · Bericht: ${join(out, 'report.md')}`)
process.exitCode = fails ? 1 : 0
