import { registerCheck } from '../../core/diagnose.js'
import { log } from '../../core/log.js'
import { nav } from '../../core/nav.js'
import { resolveAnchor } from '../../core/mount.js'
import { anchors } from '../../registry/music/anchors.js'
import { appState, playerApi, currentTrack, queueItems, queueRaw, selectedIndex, lyricsData, currentBrowse, isLoggedIn, isPlayerPageOpen } from '../../registry/music/player.js'
import { loader } from './data/catalog.js'
import { musicDb } from './data/db.js'
import { music } from './runtime.js'
import { ytxQueue } from './ytxQueue.js'

// diagnose fuer music, damit tests mit eingeloggtem konto schnell auswertbar sind

const info = { at: 0, sizes: null, lastPlay: null, lastCheck: null, error: null }

function refreshAsync() {
  if (Date.now() - info.at < 8000) return
  info.at = Date.now()
  const db = musicDb()
  Promise.all([db.sizes(), db.latest('plays', 'startedAt', 1), music.getMeta('lastReleaseCheck')])
    .then(([sizes, last, check]) => {
      info.sizes = sizes
      info.lastPlay = last[0] || null
      info.lastCheck = check
      info.error = null
    })
    .catch((e) => (info.error = e.message))
}

const ago = (ts) => {
  if (!ts) return 'nie'
  const s = Math.round((Date.now() - ts) / 1000)
  return s < 90 ? `vor ${s} s` : s < 5400 ? `vor ${Math.round(s / 60)} min` : s < 172800 ? `vor ${Math.round(s / 3600)} h` : `vor ${Math.round(s / 86400)} Tagen`
}

export function registerMusicChecks() {
  registerCheck('music.page', 'Music', 'Seite & Konto', () => {
    const b = currentBrowse()
    return [
      { id: 'music.page', label: 'Seitentyp', status: nav.page === 'other' ? 'warn' : 'ok', detail: `${nav.page}${b ? ` · browseId ${b.browseId}` : ''}${isPlayerPageOpen() ? ' · Player-Seite offen' : ''}` },
      { id: 'music.login', label: 'Anmeldung', status: 'ok', detail: isLoggedIn() ? 'eingeloggt' : 'nicht eingeloggt (Mediathek, Likes, Verlauf von YouTube fehlen)' }
    ]
  })

  registerCheck('music.sources', 'Music', 'Datenquellen', () => {
    const st = appState()
    const q = queueRaw()
    const raw = (q?.items?.length || 0) + (q?.automixItems?.length || 0)
    const parsed = queueItems().length
    return [
      { id: 'music.store', label: 'App-Zustand (Redux Store)', status: st ? 'ok' : 'fail', detail: st ? `Bereiche: ${Object.keys(st).slice(0, 12).join(', ')}` : 'ytmusic-app.polymerController.store nicht erreichbar' },
      { id: 'music.playerApi', label: 'Player-API', status: playerApi() ? 'ok' : 'skip', detail: playerApi() ? 'getVideoData, getCurrentTime, nextVideo verfügbar' : 'noch kein Player' },
      { id: 'music.browseData', label: 'Seitendaten der aktuellen Seite', status: currentBrowse() ? 'ok' : ['watch', 'search', 'other'].includes(nav.page) ? 'skip' : 'warn', detail: currentBrowse() ? 'navigation.mainContent.response vorhanden' : 'keine Browse-Daten im Store' },
      { id: 'music.queue', label: 'Warteschlange erkannt', status: raw ? (parsed === raw ? 'ok' : 'warn') : 'skip', detail: raw ? `${parsed}/${raw} Einträge gelesen · ausgewählt #${selectedIndex()}${ytxQueue.state.active ? ` · ytx-Reihenfolge aktiv ${ytxQueue.state.index + 1}/${ytxQueue.state.items.length}` : ''}` : 'leer' },
      { id: 'music.loader', label: 'Hintergrund-Seitenabrufe', status: loader.stats.errors ? 'warn' : 'ok', detail: `${loader.stats.requests} Abrufe · ${loader.stats.cacheHits} aus Cache · ${loader.stats.errors} Fehler${loader.stats.lastError ? ` (${loader.stats.lastError})` : ''}${loader.stats.lastUrl ? ` · zuletzt ${loader.stats.lastUrl} in ${loader.stats.lastMs} ms` : ''}` }
    ]
  })

  registerCheck('music.track', 'Music', 'Aktueller Song', () => {
    const t = currentTrack()
    if (!t) return { id: 'music.track', label: 'Aktueller Song', status: 'skip', detail: 'nichts geladen' }
    const who = t.artists.map((a) => `${a.name}${a.id ? '' : ' (ohne ID)'}`).join(', ')
    return [
      { id: 'music.track', label: 'Aktueller Song', status: t.title && t.artists.length ? 'ok' : 'warn', detail: `${t.title || '?'} – ${who || '?'}${t.album ? ` · ${t.album.name}` : ''} · ${Math.round(t.pos)}/${Math.round(t.dur)} s · ${t.playing ? 'spielt' : 'pausiert'}${t.ad ? ' · Werbung' : ''} · ${t.videoType || 'Typ ?'}${t.liked ? ' · ♥' : ''}` },
      (() => {
        const d = lyricsData()
        return { id: 'music.lyrics', label: 'Songtext-Erkennung', status: d ? 'ok' : 'skip', detail: !d ? 'Songtext-Tab noch nicht geladen' : d.available ? `${d.lines.length} Zeilen, ${d.timed ? 'mit' : 'ohne'} Zeitstempel` : `kein Songtext (${d.reason})` }
      })()
    ]
  })

  registerCheck('music.anchors', 'Music', 'Music-Anker', () =>
    Object.entries(anchors).map(([id, a]) => {
      const el = resolveAnchor(id)
      return { id: `music.anchor.${id}`, label: `${a.label} (${id})`, status: el ? 'ok' : 'skip', detail: el ? 'gefunden' : 'nicht auf dieser Seite / nicht sichtbar' }
    })
  )

  registerCheck('music.data', 'Music', 'Lokale Daten', () => {
    refreshAsync()
    const db = musicDb().status
    const p = music.prefs()
    const res = [
      { id: 'music.idb', label: 'IndexedDB', status: db.error || info.error ? 'fail' : db.open ? 'ok' : 'skip', detail: db.error || info.error || `${db.name} v${db.version}${db.open ? ' offen' : ' noch nicht geöffnet'}${db.blocked ? ' · von anderem Tab blockiert' : ''}${info.sizes ? ` · ${Object.entries(info.sizes).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}` },
      { id: 'music.history', label: 'Hörverlauf', status: p.history.paused ? 'warn' : info.lastPlay ? 'ok' : 'skip', detail: `${p.history.paused ? 'pausiert · ' : ''}letzter Eintrag ${ago(info.lastPlay?.endedAt)}${info.lastPlay ? ` (${info.lastPlay.title}, ${Math.round((info.lastPlay.percent || 0) * 100)} %${info.lastPlay.skipped ? ', übersprungen' : ''})` : ''}${p.history.retentionDays ? ` · Aufbewahrung ${p.history.retentionDays} Tage` : ''}` },
      { id: 'music.releaseCheck', label: 'Letzter Künstler-Check', status: info.lastCheck?.errors?.length ? 'warn' : info.lastCheck ? 'ok' : 'skip', detail: info.lastCheck ? `${ago(info.lastCheck.at)} · ${info.lastCheck.checked}/${info.lastCheck.artists} Künstler · ${info.lastCheck.fresh} neu${info.lastCheck.errors?.length ? ` · ${info.lastCheck.errors[0]}` : ''}` : 'noch keiner' },
      { id: 'music.session', label: 'Session-Preset', status: 'ok', detail: music.session()?.presetId || 'keins' }
    ]
    const errs = log.entries().filter((e) => e.level === 'error' && /music|feature m\.|mix|pageData/.test(e.msg))
    res.push({ id: 'music.errors', label: 'Feature-Fehler', status: errs.length ? 'fail' : 'ok', detail: errs.length ? errs.slice(-3).map((e) => `${e.msg}${e.n > 1 ? ` ×${e.n}` : ''}`).join(' · ') : 'keine' })
    return res
  })
}
