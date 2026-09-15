import { h } from '../core/dom.js'
import { formatDuration } from '../core/format.js'
import { row, badge, toggle, select, range, number, lines, chips, btn, textarea } from './controls.js'
import { music } from '../features/music/runtime.js'
import { catalog } from '../features/music/data/catalog.js'
import { checkReleases, releaseCheckRunning } from '../features/music/engine.js'
import { SESSION_PRESETS } from '../features/music/logic/sessions.js'
import { VERSION_TAGS, artistKey } from '../features/music/logic/versions.js'
import { DEFAULT_TERMS } from '../features/music/logic/rules.js'
import { DEFAULT_WEIGHTS } from '../features/music/logic/taste.js'
import { computeStats } from '../features/music/logic/stats.js'
import { metadata } from '../features/music/metadataProviders/index.js'
import { defaultPrefs } from '../features/music/data/prefs.js'
import { navigateEndpoint, endpoints } from '../registry/music/player.js'

// panel tabs fuer music: einstellungen, verlauf und daten, statistik

const up = (fn) => music.updatePrefs(fn)

function async(root, fn) {
  const box = h('div', null, h('p', { class: 'muted', text: 'lädt …' }))
  root.append(box)
  Promise.resolve()
    .then(fn)
    .then((node) => box.replaceChildren(...[].concat(node || [])))
    .catch((e) => box.replaceChildren(h('p', { class: 'err', text: `Fehler: ${e.message}` })))
  return box
}

function when(ts) {
  return ts ? new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function listItem(label, sub, ...actions) {
  return h('div', { class: 'row' }, h('div', { class: 'label' }, label, sub && h('small', { text: sub })), ...actions)
}

// ---------- musik einstellungen ----------

export function musicTab(app) {
  const p = music.prefs()
  const root = h('div')
  const session = music.session()

  root.append(h('h3', { text: 'Entdecken' }))
  root.append(
    row('Bekannt ⟷ Entdecken', range({ min: 0, max: 100, step: 5, unit: '', placeholder: 50 }, Math.round(p.discovery * 100), (v) => up((x) => (x.discovery = v == null ? 0.5 : v / 100))), { note: '0 = fast nur Bekanntes, 100 = passende, aber neue Künstler' }),
    row('Begründungen zeigen', toggle(p.explain, (v) => up((x) => (x.explain = v))), { note: '„Ähnlich zu …“, „Genre: …“, „Lange nicht gehört“' }),
    row(
      'Session (nur dieser Tab)',
      select([['', 'Keine'], ...SESSION_PRESETS.map((s) => [s.id, s.label])], session?.presetId || '', (v) => {
        music.setSession(v || null)
        app.rerender()
      }),
      { note: session ? SESSION_PRESETS.find((s) => s.id === session.presetId)?.description : 'Überschreibt Entdecken-Regler und Filter vorübergehend, das Profil bleibt unverändert' }
    )
  )

  root.append(h('h3', { text: 'Blocklisten' }))
  root.append(
    row('Titelbegriffe', lines(p.blocklist.terms, (v) => up((x) => (x.blocklist.terms = v)), DEFAULT_TERMS.join('\n')), { stack: true, note: 'Ganze Wörter, Groß/klein egal. Gilt für Empfehlungen und Auto-Skip' }),
    h('div', { class: 'btns' }, btn('Standardbegriffe', () => {
      up((x) => (x.blocklist.terms = [...new Set([...x.blocklist.terms, ...DEFAULT_TERMS])]))
      app.rerender()
    }, 'tiny'))
  )
  const artistBox = h('div')
  const drawArtists = () => {
    const cur = music.prefs().blocklist.artists
    artistBox.replaceChildren(
      ...cur.map((a) => listItem(a.name, a.id || 'nur Name', btn('✕', () => {
        up((x) => (x.blocklist.artists = x.blocklist.artists.filter((y) => artistKey(y) !== artistKey(a))))
        drawArtists()
      }, 'tiny')))
    )
    if (!cur.length) artistBox.append(h('p', { class: 'muted', text: 'Keine Künstler blockiert. Im Mix-Fenster über ⋯ oder hier per Name.' }))
  }
  drawArtists()
  const addArtist = h('input', { type: 'text', placeholder: 'Künstlername' })
  root.append(
    h('div', { class: 'label', style: { marginTop: '8px' } }, 'Künstler'),
    artistBox,
    h('div', { class: 'btns' }, addArtist, btn('Blockieren', () => {
      const name = addArtist.value.trim()
      if (!name) return
      up((x) => x.blocklist.artists.push({ id: null, name }))
      addArtist.value = ''
      drawArtists()
    }, 'tiny'))
  )
  const songs = music.prefs().blocklist.songs
  if (songs.length) {
    root.append(h('div', { class: 'label', style: { marginTop: '8px' } }, 'Songs'))
    for (const s of songs) root.append(listItem(s.title || s.videoId, s.artists?.map((a) => a.name).join(', '), btn('✕', () => {
      up((x) => (x.blocklist.songs = x.blocklist.songs.filter((y) => y.videoId !== s.videoId)))
      app.rerender()
    }, 'tiny')))
  }
  root.append(row('Fassungen in Empfehlungen ausblenden', chips(VERSION_TAGS.map(([id, , label]) => [id, label]), p.hideVersions, (v) => up((x) => (x.hideVersions = v))), { stack: true }))

  root.append(h('h3', { text: 'Smart Queue' }))
  const sq = p.smartQueue
  const sqRow = (key, label, note) => row(label, toggle(sq[key], (v) => up((x) => (x.smartQueue[key] = v))), { note })
  root.append(
    sqRow('autoSkip', 'Automatisch überspringen', 'Feature „Smart Queue“ muss an sein. Titel, die du selbst in der Warteschlange anklickst, werden nie übersprungen'),
    sqRow('markOnly', 'Nur markieren, nie springen'),
    sqRow('skipBlocked', 'Blockierte Künstler, Songs, Titelbegriffe'),
    sqRow('skipHighSkip', 'Titel mit hoher Skip-Quote', 'Mindestens 3 Skips und 60 % aller Wiedergaben'),
    sqRow('skipDuplicates', 'Andere Fassung eines gerade gehörten Songs'),
    sqRow('skipRecentlyPlayed', 'In den letzten 2 Stunden gespielt')
  )

  root.append(h('h3', { text: 'Neuerscheinungen' }))
  const rl = p.releases
  const status = h('span', { class: 'muted' })
  music.getMeta('lastReleaseCheck').then((r) => (status.textContent = r ? `Zuletzt ${when(r.at)}: ${r.checked}/${r.artists} geprüft, ${r.fresh} neu` : 'Noch nie geprüft')).catch(() => {})
  root.append(
    row('Im Hintergrund prüfen', toggle(rl.enabled, (v) => up((x) => (x.releases.enabled = v)))),
    row('Höchstens alle (Stunden)', number(rl.intervalHours, (v) => up((x) => (x.releases.intervalHours = v ?? 24)), { min: 6, max: 336 }), { note: 'Pro Künstler eine normale Seitenabfrage, mit 2 s Abstand' }),
    row('Max. Künstler pro Durchlauf', number(rl.maxArtists, (v) => up((x) => (x.releases.maxArtists = v ?? 25)), { min: 1, max: 100 })),
    row('Meistgehörte Künstler mitprüfen', toggle(rl.includeTopArtists, (v) => up((x) => (x.releases.includeTopArtists = v))), { note: 'Sonst nur favorisierte' }),
    row('Gilt als neu (Tage)', number(rl.maxAgeDays, (v) => up((x) => (x.releases.maxAgeDays = v ?? 60)), { min: 7, max: 730 })),
    h('div', { class: 'btns' }, btn(releaseCheckRunning() ? 'prüft …' : 'Jetzt prüfen', async (e) => {
      const b = e.currentTarget
      b.disabled = true
      const r = await checkReleases({ force: true, onProgress: (n, t) => (b.textContent = `prüft ${n}/${t}`) }).catch((err) => ({ error: err.message }))
      b.disabled = false
      b.textContent = 'Jetzt prüfen'
      status.textContent = r.error ? `Fehler: ${r.error}` : `${r.checked} geprüft, ${r.fresh} neu${r.errors?.length ? `, ${r.errors.length} Fehler` : ''}`
    }, 'tiny'), status)
  )

  root.append(h('h3', { text: 'Favoriten' }))
  async(root, async () => {
    const favs = await music.favorites.all()
    if (!favs.length) return h('p', { class: 'muted', text: 'Noch keine Favoriten. ★ in der Playerleiste oder auf Künstler-, Album- und Playlist-Seiten.' })
    const label = { artist: 'Künstler', song: 'Song', album: 'Album', playlist: 'Playlist' }
    return favs
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
      .map((f) => {
        const w = select([['0.5', '½×'], ['1', '1×'], ['1.5', '1½×'], ['2', '2×'], ['3', '3×']], String(f.weight ?? 1), (v) => music.favorites.setWeight(f.key, Number(v)))
        const open = f.type === 'artist' ? btn('↗', () => navigateEndpoint(endpoints.browse(f.id, null, 'ARTIST')), 'tiny') : null
        return listItem(h('span', null, badge(label[f.type]), ' ', f.name), f.artists?.map((a) => a.name).join(', '), open, w, btn('✕', async () => {
          await music.favorites.remove(f.key)
          app.rerender()
        }, 'tiny'))
      })
  })

  root.append(h('h3', { text: 'Feedback' }))
  async(root, async () => {
    const fb = (await music.feedback.all()).sort((a, b) => (b.ts || 0) - (a.ts || 0))
    if (!fb.length) return h('p', { class: 'muted', text: 'Noch kein Feedback. „Mehr davon“ / „Weniger davon“ im Mix-Fenster oder im ★-Menü.' })
    return fb.slice(0, 60).map((f) =>
      listItem(`${f.type === 'artist' ? 'Künstler' : 'Song'}: ${f.name || f.id}`, `${f.value > 0 ? '+' : ''}${f.value}${f.ignore ? ' · ignoriert' : ''}`, btn('✕', async () => {
        await music.feedback.remove(f.key)
        app.rerender()
      }, 'tiny'))
    )
  })

  root.append(h('h3', { text: 'Gewichtung' }))
  const labels = { complete: 'Komplett gehört', repeat: 'Wiederholt', like: 'Like', partial: 'Teilweise gehört', skip: 'Übersprungen (früh zählt voll)', favoriteArtist: 'Favorisierter Künstler', favoriteSong: 'Favorisierter Song', favoriteAlbum: 'Favorisiertes Album', favoritePlaylist: 'Favorisierte Playlist', feedback: 'Feedback pro Stufe' }
  for (const k of Object.keys(DEFAULT_WEIGHTS)) root.append(row(labels[k] || k, number(p.weights[k], (v) => up((x) => (x.weights[k] = v ?? DEFAULT_WEIGHTS[k])), { step: 0.1, min: -10, max: 10 })))
  root.append(
    row('Halbwertszeit (Tage)', number(p.halfLifeDays, (v) => up((x) => (x.halfLifeDays = v ?? 120)), { min: 7, max: 3650 }), { note: 'Wie schnell alte Wiedergaben an Gewicht verlieren' }),
    h('div', { class: 'btns' }, btn('Gewichte zurücksetzen', () => {
      up((x) => {
        x.weights = { ...DEFAULT_WEIGHTS }
        x.halfLifeDays = defaultPrefs().halfLifeDays
      })
      app.rerender()
    }, 'tiny'))
  )

  root.append(h('h3', { text: 'Metadaten-Quellen' }))
  root.append(h('p', { class: 'hint', text: 'Lokal reicht für alles. Externe Quellen sind freiwillig, aus und schicken Künstlernamen an den jeweiligen Dienst.' }))
  for (const st of metadata.status(p)) {
    const ctl = toggle(st.enabled, (v) => {
      up((x) => (x.providers[st.id].enabled = v))
      app.rerender()
    })
    root.append(row(h('span', null, st.label, st.external ? badge('extern') : badge('lokal')), ctl, { note: `${st.note}${st.enabled && !st.available ? ' · nicht verfügbar (Schlüssel/Modell fehlt oder kein GM_xmlhttpRequest)' : ''}${st.lastError ? ` · Fehler: ${st.lastError}` : ''}` }))
    if (st.id === 'lastfm' && st.enabled) root.append(row('Last.fm API-Key', textarea(p.providers.lastfm.apiKey, (v) => up((x) => (x.providers.lastfm.apiKey = v.trim())))))
    if (st.id === 'ollama' && st.enabled) {
      root.append(
        row('Ollama URL', textarea(p.providers.ollama.url, (v) => up((x) => (x.providers.ollama.url = v.trim())))),
        row('Modell', textarea(p.providers.ollama.model, (v) => up((x) => (x.providers.ollama.model = v.trim())), 'z. B. llama3.2'))
      )
    }
  }
  return root
}

// ---------- verlauf und daten ----------

export function musicDataTab(app) {
  const p = music.prefs()
  const root = h('div')

  root.append(h('h3', { text: 'Hörverlauf' }))
  root.append(
    row('Hörverlauf pausieren', toggle(p.history.paused, (v) => up((x) => (x.history.paused = v))), { note: 'Während der Pause wird nichts gespeichert, das Profil bleibt' }),
    row('Erst speichern ab (Sekunden)', number(p.history.minListenSec, (v) => up((x) => (x.history.minListenSec = v ?? 5)), { min: 0, max: 120 })),
    row('Kontext speichern', toggle(p.history.recordContext, (v) => up((x) => (x.history.recordContext = v))), { note: 'Seite, Playlist und Session, aus der gehört wurde' }),
    row('Aufbewahren (Tage)', number(p.history.retentionDays, (v) => up((x) => (x.history.retentionDays = v)), { min: 1, max: 3650, placeholder: 'unbegrenzt' }), { note: 'Ältere Einträge werden täglich gelöscht' }),
    h('div', { class: 'btns' }, btn('Aufbewahrung jetzt anwenden', async () => app.flash(`${await music.history.applyRetention()} Einträge gelöscht`), 'tiny'))
  )

  root.append(h('h3', { text: 'Einträge' }))
  const search = h('input', { type: 'search', placeholder: 'Titel oder Künstler filtern' })
  const listBox = h('div')
  let limit = 60
  const draw = async () => {
    const all = await music.history.recent(2000)
    const q = search.value.trim().toLowerCase()
    const hits = q ? all.filter((r) => `${r.title} ${(r.artists || []).map((a) => a.name).join(' ')}`.toLowerCase().includes(q)) : all
    listBox.replaceChildren(h('p', { class: 'muted', text: `${all.length}${all.length >= 2000 ? '+' : ''} Einträge${q ? ` · ${hits.length} Treffer` : ''}` }))
    for (const r of hits.slice(0, limit)) {
      const flags = [r.completed ? '✓ komplett' : r.skipped ? `⏭ bei ${formatDuration(r.skipAtSec || 0)}${r.quickSkip ? ' (früh)' : ''}` : `${Math.round((r.percent || 0) * 100)} %`, r.repeat && '↻', r.liked && '♥'].filter(Boolean).join(' · ')
      const sub = `${when(r.startedAt)} · ${(r.artists || []).map((a) => a.name).join(', ')} · ${formatDuration(r.listenedSec || 0)} gehört · ${flags}`
      const menu = btn('⋯', () => {
        const box = h('div', { class: 'btns', style: { width: '100%' } },
          btn('Song nicht ins Profil', async () => app.flash(await music.act('excludeSong', r)), 'tiny'),
          r.artists?.[0] && btn(`${r.artists[0].name} nicht ins Profil`, async () => app.flash(await music.act('excludeArtist', r)), 'tiny'),
          btn('Eintrag löschen', async () => {
            await music.history.remove(r.id)
            draw()
          }, 'tiny danger')
        )
        item.after(box)
      }, 'tiny')
      const item = listItem(r.title || r.videoId, sub, btn('✕', async () => {
        await music.history.remove(r.id)
        draw()
      }, 'tiny'), menu)
      listBox.append(item)
    }
    if (hits.length > limit) listBox.append(h('div', { class: 'btns' }, btn('Mehr zeigen', () => {
      limit += 100
      draw()
    }, 'tiny')))
  }
  search.addEventListener('input', () => draw())
  root.append(search, listBox)
  draw().catch((e) => listBox.replaceChildren(h('p', { class: 'err', text: e.message })))
  root.append(h('div', { class: 'btns' }, btn('Gesamten Verlauf löschen', (e) => {
    const box = h('div', { class: 'btns' }, h('span', { class: 'muted', text: 'Wirklich alle Hör-Einträge löschen? Favoriten und Feedback bleiben.' }), btn('Ja, löschen', async () => {
      await music.history.clear()
      app.flash('Verlauf gelöscht')
      app.rerender()
    }, 'tiny danger'), btn('Nein', () => box.remove(), 'tiny'))
    e.currentTarget.parentElement.after(box)
  }, 'danger')))

  root.append(h('h3', { text: 'Vom Profil ausgeschlossen' }))
  const ex = p.excluded
  if (!ex.artists.length && !ex.songs.length) root.append(h('p', { class: 'muted', text: 'Nichts ausgeschlossen. Ausgeschlossenes bleibt im Verlauf, zählt aber nicht für Empfehlungen und Statistik-Profil.' }))
  for (const a of ex.artists) root.append(listItem(`Künstler: ${a.name}`, null, btn('✕', () => {
    up((x) => (x.excluded.artists = x.excluded.artists.filter((y) => artistKey(y) !== artistKey(a))))
    app.rerender()
  }, 'tiny')))
  for (const s of ex.songs) root.append(listItem(`Song: ${s.title || s.videoId}`, s.artists?.map((a) => a.name).join(', '), btn('✕', () => {
    up((x) => (x.excluded.songs = x.excluded.songs.filter((y) => y.videoId !== s.videoId)))
    app.rerender()
  }, 'tiny')))
  const exName = h('input', { type: 'text', placeholder: 'Künstlername ausschließen' })
  root.append(h('div', { class: 'btns' }, exName, btn('Ausschließen', () => {
    const name = exName.value.trim()
    if (!name) return
    up((x) => x.excluded.artists.push({ id: null, name }))
    app.rerender()
  }, 'tiny')))

  root.append(h('h3', { text: 'Export / Import' }))
  const out = h('textarea', { readonly: true, style: { minHeight: '70px' }, placeholder: 'Export erscheint hier' })
  const replace = { v: false }
  const inp = h('textarea', { placeholder: 'Sicherung (JSON) hier einfügen', style: { minHeight: '70px' } })
  const file = h('input', { type: 'file', accept: 'application/json,.json' })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    if (f) inp.value = await f.text()
  })
  root.append(
    h('div', { class: 'btns' },
      btn('Exportieren', async () => {
        const dump = await music.exportData()
        out.value = JSON.stringify(dump)
        app.flash((await app.copyText(out.value)) ? `Export kopiert (${Math.round(out.value.length / 1024)} KB)` : 'Export unten markieren und kopieren')
      }, 'primary'),
      btn('Als Datei speichern', async () => {
        const dump = await music.exportData()
        const blob = new Blob([JSON.stringify(dump, null, 1)], { type: 'application/json' })
        const a = h('a', { href: URL.createObjectURL(blob), download: `ytx-music-${new Date().toISOString().slice(0, 10)}.json` })
        document.body.append(a)
        a.click()
        setTimeout(() => {
          URL.revokeObjectURL(a.href)
          a.remove()
        }, 1000)
      })
    ),
    out,
    file,
    inp,
    row('Vorhandene Daten ersetzen', toggle(false, (v) => (replace.v = v)), { note: 'Aus: zusammenführen' }),
    h('div', { class: 'btns' }, btn('Importieren', async () => {
      try {
        const names = await music.importData(JSON.parse(inp.value), { replace: replace.v })
        app.flash(`Importiert: ${names.join(', ')}`)
        app.rerender()
      } catch (e) {
        app.flash(`Import fehlgeschlagen: ${e.message}`)
      }
    }, 'primary'))
  )

  root.append(h('h3', { text: 'Speicher' }))
  async(root, async () => {
    const db = music.db()
    const sizes = await db.sizes()
    const cache = await catalog.cacheInfo()
    return [
      listItem('IndexedDB', `${db.status.name} v${db.status.version} · ${db.status.open ? 'offen' : 'geschlossen'}${db.status.upgradedFrom != null ? ` · migriert von v${db.status.upgradedFrom}` : ''}`),
      listItem('Einträge', Object.entries(sizes).map(([k, v]) => `${k}: ${v}`).join(' · ')),
      listItem('Seiten-Cache', `${cache.count} Seiten · neuester ${when(cache.newest)} · ${catalog.stats.requests} Abrufe in dieser Sitzung`, btn('Cache leeren', async () => {
        await catalog.clearCache()
        app.rerender()
      }, 'tiny'))
    ]
  })
  return root
}

// ---------- statistik ----------

export function musicStatsTab(app) {
  const root = h('div')
  const ranges = [
    ['7', 'Letzte 7 Tage'],
    ['30', 'Letzte 30 Tage'],
    ['month', 'Dieser Monat'],
    ['year', 'Dieses Jahr'],
    ['all', 'Alles']
  ]
  app.ui.statsRange ||= '30'
  const body = h('div')
  root.append(
    row('Zeitraum', select(ranges, app.ui.statsRange, (v) => {
      app.ui.statsRange = v
      draw()
    })),
    body
  )

  const bars = (list, labelFn, valueFn) => {
    const max = Math.max(1, ...list.map(valueFn))
    return h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: '70px', margin: '6px 0 2px' } },
      ...list.map((x, i) => h('div', { title: `${labelFn(x, i)}: ${Math.round(valueFn(x) / 60)} min`, style: { flex: '1', minWidth: '3px', height: `${Math.max(2, (valueFn(x) / max) * 70)}px`, background: 'var(--accent)', borderRadius: '2px 2px 0 0', opacity: valueFn(x) ? '1' : '.25' } }))
    )
  }

  async function draw() {
    body.replaceChildren(h('p', { class: 'muted', text: 'rechnet …' }))
    const now = new Date()
    const r = app.ui.statsRange
    const from = r === 'all' ? 0 : r === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : r === 'year' ? new Date(now.getFullYear(), 0, 1).getTime() : Date.now() - Number(r) * 86400000
    const plays = await music.history.list({ from })
    const st = computeStats(plays, { from, groupBy: r === 'year' || r === 'all' ? 'month' : 'week', limit: 10 })
    const t = st.totals
    body.replaceChildren()
    if (!t.plays) return body.append(h('p', { class: 'muted', text: 'Noch keine Hör-Einträge in diesem Zeitraum. Feature „Hörverlauf“ muss an sein.' }))
    body.append(
      h('div', { class: 'summary', style: { flexWrap: 'wrap' } },
        h('span', null, h('b', { text: formatDuration(t.listenedSec) }), 'gehört'),
        h('span', null, h('b', { text: String(t.plays) }), 'Wiedergaben'),
        h('span', null, h('b', { text: String(t.songs) }), 'Songs'),
        h('span', null, h('b', { text: String(t.artists) }), 'Künstler'),
        h('span', null, h('b', { text: `${Math.round(t.skipRate * 100)} %` }), 'Skip-Quote')
      )
    )
    const top = (title, list, fmt) => {
      body.append(h('h3', { text: title }))
      list.forEach((x, i) => body.append(listItem(`${i + 1}. ${fmt(x)}`, `${x.plays}× · ${formatDuration(x.listenedSec)}${x.skips ? ` · ${x.skips} Skips` : ''}`)))
    }
    top('Top-Songs', st.topSongs, (x) => `${x.title} – ${(x.artists || []).map((a) => a.name).join(', ')}`)
    top('Top-Künstler', st.topArtists, (x) => x.name)
    if (st.topAlbums.length) top('Top-Alben', st.topAlbums, (x) => x.name)
    body.append(h('h3', { text: 'Verlauf' }), bars(st.series, (x) => x.period, (x) => x.listenedSec), h('div', { class: 'hint', text: `${st.series[0]?.period || ''} … ${st.series.at(-1)?.period || ''}` }))
    body.append(h('h3', { text: 'Tageszeit' }), bars(st.byHour, (x, i) => `${i} Uhr`, (x) => x.listenedSec), h('div', { class: 'hint', text: '0 Uhr … 23 Uhr' }))
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
    body.append(h('h3', { text: 'Wochentag' }), bars(st.byWeekday, (x, i) => days[i], (x) => x.listenedSec), h('div', { class: 'hint', text: days.join(' · ') }))
    if (st.highSkip.length) top('Oft übersprungen', st.highSkip, (x) => `${x.title} – ${(x.artists || []).map((a) => a.name).join(', ')}`)
    body.append(h('div', { class: 'btns' }, btn('Als Text kopieren', async () => {
      const label = ranges.find(([v]) => v === r)?.[1]
      const text = [
        `Mein ytx Music Rückblick · ${label}`,
        `${formatDuration(t.listenedSec)} gehört · ${t.plays} Wiedergaben · ${t.songs} Songs · ${t.artists} Künstler · Skip-Quote ${Math.round(t.skipRate * 100)} %`,
        '',
        'Top-Songs',
        ...st.topSongs.map((x, i) => `${i + 1}. ${x.title} – ${(x.artists || []).map((a) => a.name).join(', ')} (${x.plays}×)`),
        '',
        'Top-Künstler',
        ...st.topArtists.map((x, i) => `${i + 1}. ${x.name} (${formatDuration(x.listenedSec)})`)
      ].join('\n')
      app.flash((await app.copyText(text)) ? 'Rückblick kopiert' : 'Kopieren fehlgeschlagen')
    })))
  }
  draw().catch((e) => body.replaceChildren(h('p', { class: 'err', text: e.message })))
  return root
}
