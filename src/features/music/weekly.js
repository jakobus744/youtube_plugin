import { h } from '../../core/dom.js'
import { copyText } from '../../core/clipboard.js'
import { formatDuration } from '../../core/format.js'
import { navigateEndpoint, endpoints } from '../../registry/music/player.js'
import { music } from './runtime.js'
import { weeklyRecap, lastWeekStart, recapText } from './logic/recap.js'
import { toast } from '../ui.js'

// wochenrueckblick: ab montag einmal pro woche als karte, jederzeit ueber den statistik tab

const SEEN = 'weeklySeen'
let card = null

const CSS = `
.ytx-m-recap { position: fixed; z-index: 2300; left: 16px; bottom: 88px; width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 170px); overflow: auto; box-sizing: border-box; padding: 16px 18px; border-radius: 12px;
  font: 400 13px/1.45 Roboto, Arial, sans-serif; color: var(--ytmusic-text-primary, #fff); background: var(--ytmusic-brand-background-solid, #212121); box-shadow: 0 8px 32px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.1); }
.ytx-m-recap h3 { margin: 0 0 2px; font-size: 17px; font-weight: 700; }
.ytx-m-recap .sub { color: var(--ytmusic-text-secondary, #aaa); margin-bottom: 10px; }
.ytx-m-recap .sec { margin: 10px 0 4px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--ytmusic-text-secondary, #aaa); }
.ytx-m-recap ol { margin: 0; padding-left: 20px; }
.ytx-m-recap li { margin: 2px 0; }
.ytx-m-recap .muted { color: var(--ytmusic-text-secondary, #aaa); }
.ytx-m-recap .new { display: flex; flex-wrap: wrap; gap: 6px; }
.ytx-m-recap .new button { all: initial; cursor: pointer; padding: 3px 9px; border-radius: 12px; font: 500 12px Roboto, Arial, sans-serif; color: #000; background: #ffc83d; }
.ytx-m-recap .acts { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.ytx-m-recap .acts button { all: initial; cursor: pointer; padding: 6px 12px; border-radius: 16px; font: 500 12px Roboto, Arial, sans-serif; color: var(--ytmusic-text-primary, #fff); background: rgba(255,255,255,.12); }
.ytx-m-recap .acts button.primary { color: #000; background: #fff; }
`

export function closeRecap() {
  card?.remove()
  card = null
}

function render(r) {
  closeRecap()
  const style = h('style', { text: CSS })
  const who = (s) => s.artists.map((a) => a.name).join(', ')
  const newBox = h('div', { class: 'new' })
  for (const a of r.newArtists) {
    const b = h('button', { type: 'button', title: a.id ? 'Künstlerseite öffnen' : '', text: a.name })
    if (a.id) b.addEventListener('click', () => navigateEndpoint(endpoints.browse(a.id, null, 'ARTIST')))
    newBox.append(b)
  }
  const copy = h('button', { type: 'button', text: 'Als Text kopieren' })
  copy.addEventListener('click', async () => toast((await copyText(recapText(r, formatDuration))) ? 'Rückblick kopiert' : 'Kopieren fehlgeschlagen'))
  const close = h('button', { type: 'button', class: 'primary', text: 'Schließen' })
  close.addEventListener('click', closeRecap)
  card = h(
    'div',
    { class: 'ytx-m-recap', role: 'dialog', 'data-ytx-own': '' },
    style,
    h('h3', { text: 'Deine Musikwoche' }),
    h('div', { class: 'sub', text: `${r.label} · ${formatDuration(r.listenedSec)} · ${r.plays} Wiedergaben · ${r.artistCount} Künstler` }),
    h('div', { class: 'sec', text: 'Top-Künstler' }),
    h('ol', null, ...r.topArtists.map((a) => h('li', null, a.name, h('span', { class: 'muted', text: ` · ${formatDuration(a.listenedSec)}` })))),
    h('div', { class: 'sec', text: 'Top-Songs' }),
    h('ol', null, ...r.topSongs.map((s) => h('li', null, s.title, h('span', { class: 'muted', text: ` – ${who(s)} · ${s.plays}×` })))),
    h('div', { class: 'sec', text: r.newArtistCount ? `Neu entdeckt · ${r.newArtistCount}` : 'Neu entdeckt' }),
    r.newArtists.length ? newBox : h('div', { class: 'muted', text: 'Diese Woche keine neuen Künstler. Im Mix-Fenster unter „Noch nie gehört“ gibt es Vorschläge.' }),
    h('div', { class: 'acts' }, copy, close)
  )
  document.body.append(card)
}

// letzte volle woche oder eine bestimmte woche anzeigen
export async function showRecap(start = lastWeekStart(Date.now())) {
  const plays = await music.history.list({ from: 0 })
  const r = weeklyRecap(plays, start)
  if (!r) return false
  render(r)
  return true
}

export const weeklyFeature = {
  id: 'm.weekly',
  site: 'music',
  label: 'Wochenrückblick',
  group: 'Hören',
  description: 'Ab Montag einmal pro Woche eine kleine Karte: Hörzeit, Top-Künstler, Top-Songs und neu entdeckte Künstler der letzten Woche. Jederzeit auch im Tab „Statistik“',
  stability: 'hoch',
  settings: {},
  setup(ctx) {
    let last = null
    const check = async () => {
      try {
        const start = lastWeekStart(Date.now())
        if ((await music.getMeta(SEEN)) === start) return
        const shown = await showRecap(start)
        // auch ohne daten als erledigt markieren, sonst jeden tag neu pruefen
        await music.setMeta(SEEN, start)
        last = { at: Date.now(), start, shown }
      } catch (e) {
        ctx.log.warn('music weekly', e)
        last = { at: Date.now(), error: e.message }
      }
    }
    const t = setTimeout(check, 6000)
    return {
      check,
      dispose() {
        clearTimeout(t)
        closeRecap()
      },
      health() {
        if (!last) return { status: 'skip', detail: 'prüft kurz nach dem Laden' }
        if (last.error) return { status: 'warn', detail: last.error }
        return { status: 'ok', detail: last.shown ? 'Rückblick dieser Woche gezeigt' : 'keine Hördaten letzte Woche' }
      }
    }
  }
}
