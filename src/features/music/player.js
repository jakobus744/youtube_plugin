import { h, qsa } from '../../core/dom.js'
import { dataOf } from '../../core/bridge.js'
import { formatDuration, formatTimeOfDay } from '../../core/format.js'
import { listen } from '../../core/lifecycle.js'
import { currentTrack, queueItems, selectedIndex, lyricsData, lyricsTabIndex, appState, nextVideo, mediaEl } from '../../registry/music/player.js'
import { parseQueueItem } from '../../registry/music/parse.js'
import { music } from './runtime.js'
import { autoSkipped } from './history.js'
import { ytxQueue } from './ytxQueue.js'
import { skipDecision, queueTotals } from './logic/queue.js'
import { trackKey } from './logic/versions.js'
import { formatLyrics, LYRICS_FORMATS } from './logic/lyrics.js'
import { toast, showMenu, textDialog } from '../ui.js'
import { debounce } from '../../core/scheduler.js'

// ---------- smart queue ----------

// element daten sind je nach version der renderer selbst oder sein wrapper
function queueItemOf(raw) {
  if (!raw) return null
  return parseQueueItem(raw) || parseQueueItem({ playlistPanelVideoRenderer: raw })
}

const SKIP_SETTING = { term: 'skipBlocked', artist: 'skipBlocked', song: 'skipBlocked', highSkip: 'skipHighSkip', duplicate: 'skipDuplicates', recent: 'skipRecentlyPlayed', unknown: null }

export const smartQueueFeature = {
  id: 'm.smartQueue',
  site: 'music',
  label: 'Smart Queue (Auto-Skip & Markierungen)',
  group: 'Warteschlange',
  description: 'Markiert in YouTubes Warteschlange blockierte, oft übersprungene und doppelte Titel und überspringt sie auf Wunsch automatisch. Die Warteschlange selbst wird nicht umgebaut. Regeln im Tab „Musik“',
  stability: 'mittel',
  settings: {
    marks: { type: 'toggle', label: 'Markierungen in der Warteschlange', default: true },
    notify: { type: 'toggle', label: 'Hinweis beim automatischen Überspringen', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    let profile = null
    const recentKeys = new Map()
    const recentIds = new Map()
    const stats = { skipped: 0, last: null, marked: 0 }
    let lastVideo = null
    let decidedFor = null
    let userPicked = { videoId: null, at: 0 }
    let burst = []

    const loadProfile = debounce(async () => {
      try {
        profile = await music.profile()
        for (const p of (profile.playsList || []).slice(-300)) {
          recentIds.set(p.videoId, Math.max(recentIds.get(p.videoId) || 0, p.startedAt))
          recentKeys.set(trackKey(p), { videoId: p.videoId, ts: p.startedAt })
        }
      } catch (e) {
        ctx.log.warn('smart queue profil', e)
      }
    }, 800)
    loadProfile()
    const offs = [music.on('plays', loadProfile), music.on('favorites', loadProfile), music.on('feedback', loadProfile), music.on('prefs', loadProfile)]

    // klick in die warteschlange ist eine bewusste wahl, die wird nie uebersprungen
    offs.push(
      listen(document, 'click', (e) => {
        const item = e.target?.closest?.('ytmusic-player-queue-item')
        const d = item && dataOf(item)
        const vid = queueItemOf(d)?.videoId
        if (vid) userPicked = { videoId: vid, at: Date.now() }
      }, true)
    )

    const decide = (track, withHistory = true) => {
      const prefs = music.prefs()
      const eff = music.effective()
      const settings = { ...prefs.smartQueue, skipHighSkip: eff.skipHighSkip, skipRecentlyPlayed: eff.skipRecentlyPlayed, onlyKnownArtists: eff.onlyKnownArtists }
      return skipDecision(track, { rules: music.rules(), profile, settings, recentKeys: withHistory ? recentKeys : null, recentIds: withHistory ? recentIds : null })
    }

    const tick = () => {
      const t = currentTrack()
      if (!t || t.ad) return
      const now = Date.now()
      if (t.videoId !== lastVideo) {
        lastVideo = t.videoId
        decidedFor = null
      }
      if (decidedFor === t.videoId || !t.title) return
      decidedFor = t.videoId
      const prefs = music.prefs()
      // erst entscheiden, dann in den verlauf der session aufnehmen
      const d = decide(t)
      recentIds.set(t.videoId, now)
      if (!recentKeys.has(trackKey(t)) || recentKeys.get(trackKey(t)).videoId === t.videoId) recentKeys.set(trackKey(t), { videoId: t.videoId, ts: now })
      if (!d) return
      stats.last = { title: t.title, reason: d.label, at: now, skipped: false }
      const key = SKIP_SETTING[d.kind]
      const allowed = d.kind === 'unknown' ? true : !!prefs.smartQueue[key] || (d.kind === 'highSkip' && music.effective().skipHighSkip)
      if (!prefs.smartQueue.autoSkip || prefs.smartQueue.markOnly || !allowed) return
      if (userPicked.videoId === t.videoId && now - userPicked.at < 15000) return
      if (ytxQueue.state.active && ytxQueue.state.items[ytxQueue.state.index]?.videoId === t.videoId) return
      burst = burst.filter((x) => now - x < 30000)
      if (burst.length >= 6) {
        stats.last.reason += ' (Schutz: zu viele Sprünge, pausiert)'
        return
      }
      burst.push(now)
      autoSkipped.set(t.videoId, now)
      stats.skipped++
      stats.last.skipped = true
      if (s.notify) toast(`Übersprungen: ${t.title} – ${d.label}`)
      nextVideo()
    }

    const marks = () => {
      if (!s.marks) return
      const items = qsa('ytmusic-player-page ytmusic-player-queue-item, ytmusic-player-queue ytmusic-player-queue-item')
      const seenKeys = new Map()
      let n = 0
      for (const el of items) {
        const raw = dataOf(el)
        const p = queueItemOf(raw)
        const old = el.querySelector(':scope .ytx-m-mark')
        if (!p?.videoId) continue
        const k = trackKey(p)
        let d = decide(p, false)
        if (!d && seenKeys.has(k) && seenKeys.get(k) !== p.videoId) d = { kind: 'duplicate', label: 'Doppelt' }
        seenKeys.set(k, p.videoId)
        const label = d ? (d.kind === 'term' ? d.label.replace('Titelbegriff: ', '') : d.kind === 'highSkip' ? 'oft übersprungen' : d.kind === 'duplicate' ? 'doppelt' : d.kind === 'artist' ? 'Künstler blockiert' : d.kind === 'song' ? 'blockiert' : d.label) : null
        if (!label) {
          old?.remove()
          el.removeAttribute('data-ytx-skip')
          continue
        }
        n++
        el.setAttribute('data-ytx-skip', d.kind)
        if (old && old.textContent === label) continue
        old?.remove()
        const host = el.querySelector('.song-info .byline-wrapper, .song-info, .title-wrapper, .song-title') || el
        host.append(h('span', { class: 'ytx-m-mark', 'data-kind': d.kind, 'data-ytx-own': '', title: d.label, text: label }))
      }
      stats.marked = n
    }

    const timer = setInterval(tick, 700)
    const offSweep = ctx.onSweep(marks)

    return {
      stats,
      update(next) {
        s = next
        if (!s.marks) for (const m of qsa('.ytx-m-mark')) m.remove()
        marks()
      },
      dispose() {
        clearInterval(timer)
        offSweep()
        for (const off of offs) off()
        for (const m of qsa('.ytx-m-mark')) m.remove()
        for (const el of qsa('[data-ytx-skip]')) el.removeAttribute('data-ytx-skip')
      },
      health() {
        const prefs = music.prefs()
        const q = queueItems()
        const mode = prefs.smartQueue.autoSkip ? (prefs.smartQueue.markOnly ? 'nur markieren' : 'Auto-Skip an') : 'Auto-Skip aus'
        if (!appState()) return { status: 'fail', detail: 'App-Zustand nicht lesbar' }
        return { status: 'ok', detail: `${mode} · Warteschlange ${q.length} Titel erkannt · ${stats.marked} markiert · ${stats.skipped} übersprungen${stats.last ? ` · zuletzt: ${stats.last.title} (${stats.last.reason})` : ''}${profile ? '' : ' · Profil lädt'}` }
      }
    }
  }
}

// ---------- warteschlangen dauer ----------

export const queueInfoFeature = {
  id: 'm.queueInfo',
  site: 'music',
  label: 'Warteschlange: Gesamt- und Restdauer',
  group: 'Warteschlange',
  description: '„32 Titel · 1:54 h · noch 1:31 h · endet 23:10“ über der Warteschlange',
  stability: 'hoch',
  anchors: ['m.queue.top'],
  settings: {
    endTime: { type: 'toggle', label: 'Uhrzeit des Endes anzeigen', default: true },
    automix: { type: 'toggle', label: 'Automix-Titel mitzählen', default: false }
  },
  setup(ctx) {
    let s = ctx.settings
    let text = ''
    const m = ctx.mount({
      id: 'm.queueInfo',
      anchor: 'm.queue.top',
      position: 'prepend',
      create: () => h('div', { class: 'ytx-m-info' }),
      update: (node) => {
        const all = queueItems().filter((x) => s.automix || !x.automix)
        if (!all.length) {
          node.textContent = text = ''
          return
        }
        const t = currentTrack()
        const sel = Math.max(0, all.findIndex((x) => x.index === selectedIndex()))
        const tot = queueTotals(all, sel, t?.pos || 0)
        const rate = t?.rate || 1
        const parts = [`${tot.count} Titel`, formatDuration(tot.total), `noch ${formatDuration(tot.remaining / rate)}`]
        if (s.endTime && tot.remaining) parts.push(`endet ${formatTimeOfDay(new Date(Date.now() + (tot.remaining / rate) * 1000))}`)
        if (tot.unknown) parts.push(`${tot.unknown} ohne Dauer`)
        const next = parts.join(' · ')
        if (next !== text) node.textContent = text = next
      }
    })
    const timer = setInterval(() => m.refresh(), 5000)
    return {
      update(next) {
        s = next
        m.refresh()
      },
      dispose() {
        clearInterval(timer)
        m.destroy()
      },
      health: () => (m.ok ? { status: text ? 'ok' : 'skip', detail: text || 'Warteschlange leer' } : { status: 'skip', detail: 'Warteschlange nicht sichtbar (Player-Seite öffnen)' })
    }
  }
}

// ---------- songtext kopieren ----------

async function ensureLyrics(timeout = 5000) {
  let d = lyricsData()
  if (d) return d
  const idx = lyricsTabIndex()
  if (idx < 0) return null
  const tab = document.querySelectorAll('ytmusic-player-page tp-yt-paper-tab')[idx]
  tab?.click()
  const end = Date.now() + timeout
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 150))
    d = lyricsData()
    if (d) return d
  }
  return null
}

export const lyricsFeature = {
  id: 'm.lyrics',
  site: 'music',
  label: 'Songtext kopieren',
  group: 'Player',
  description: 'Button über dem Songtext: nur Text, mit Titel, mit Zeitstempeln (nur wenn YouTube Music zeitgestempelte Texte liefert) oder als LRC. Erscheint nur, wenn es einen Songtext gibt',
  stability: 'mittel-hoch',
  anchors: ['m.lyrics'],
  hotkeys: [['music.lyricsCopy', 'Songtext kopieren', 'Alt+L']],
  settings: {
    format: { type: 'select', label: 'Standardformat', options: LYRICS_FORMATS, default: 'plain' }
  },
  setup(ctx) {
    let s = ctx.settings
    let last = null
    const copy = async (mode) => {
      const d = await ensureLyrics()
      if (!d) return toast('Songtext noch nicht geladen')
      if (!d.available) return toast(`Kein Songtext: ${d.reason}`)
      const t = currentTrack()
      const useMode = mode === 'timestamps' && !d.timed ? 'plain' : mode
      const text = formatLyrics(d, { mode: useMode, meta: t || {} })
      last = { at: Date.now(), mode: useMode, lines: d.lines.length, timed: d.timed }
      if (await ctx.copyText(text)) toast(`Songtext kopiert${mode === 'timestamps' && !d.timed ? ' (ohne Zeitstempel, keine vorhanden)' : ''}`)
      else textDialog('Songtext', text)
    }
    const m = ctx.mount({
      id: 'm.lyrics.copy',
      anchor: 'm.lyrics',
      position: 'before',
      when: () => !!lyricsData()?.available,
      create: () => {
        const main = h('button', { type: 'button', class: 'ytx-m-pill', text: '⧉ Songtext kopieren' })
        const more = h('button', { type: 'button', class: 'ytx-m-pill', text: '▾', title: 'Format wählen' })
        main.addEventListener('click', (e) => {
          e.stopPropagation()
          copy(s.format)
        })
        more.addEventListener('click', (e) => {
          e.stopPropagation()
          const d = lyricsData()
          showMenu(more, [{ title: 'Kopieren als' }, ...LYRICS_FORMATS.map(([id, label]) => ({ label, checked: id === s.format, disabled: (id === 'timestamps') && !d?.timed, sub: id === 'timestamps' && !d?.timed ? 'nicht verfügbar' : '', run: () => copy(id) }))])
        })
        return h('div', { style: { display: 'flex', gap: '6px', margin: '8px 0 12px' } }, main, more)
      }
    })
    ctx.action('music.lyricsCopy', () => copy(s.format))
    const timer = setInterval(() => m.refresh(), 1500)
    return {
      update(next) {
        s = next
      },
      onVideo() {
        m.refresh()
      },
      dispose() {
        clearInterval(timer)
        m.destroy()
      },
      health() {
        const d = lyricsData()
        if (!d) return { status: 'skip', detail: 'Songtext-Tab noch nicht geöffnet' }
        if (!d.available) return { status: 'skip', detail: `kein Songtext für diesen Titel (${d.reason})` }
        return { status: m.ok ? 'ok' : 'warn', detail: `${d.lines.length} Zeilen · ${d.timed ? 'mit Zeitstempeln' : 'ohne Zeitstempel'}${m.ok ? '' : ' · Button-Anker fehlt'}${last ? ` · zuletzt kopiert ${new Date(last.at).toLocaleTimeString('de-DE')}` : ''}` }
      }
    }
  }
}

// ---------- audio ----------

const EQ_BANDS = [60, 230, 910, 3600, 14000]
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [6, 3, 0, 0, 0],
  vocal: [-2, 0, 3, 3, 0],
  treble: [0, 0, 0, 3, 5],
  loudness: [5, 2, 0, 2, 4],
  night: [-4, -1, 1, 1, -2]
}

export const audioFeature = {
  id: 'm.audio',
  site: 'music',
  label: 'Audio statt Video & Equalizer',
  group: 'Player',
  description: 'Schaltet Musikvideos automatisch auf die Audiofassung um, wenn es eine gibt. Equalizer ist experimentell: er leitet den Ton durch Web Audio, bei Problemen einfach ausschalten und die Seite neu laden',
  stability: 'experimentell',
  settings: {
    preferAudio: { type: 'toggle', label: 'Immer Audiofassung (Titel statt Video)', default: true },
    eq: { type: 'select', label: 'Equalizer (experimentell)', options: [['', 'Aus'], ['flat', 'Neutral'], ['bass', 'Bass+'], ['vocal', 'Stimme'], ['treble', 'Höhen+'], ['loudness', 'Loudness'], ['night', 'Nacht (leise Bässe)']], default: '' },
    preamp: { type: 'range', label: 'Vorverstärkung (dB)', min: -12, max: 6, step: 1, default: 0 }
  },
  setup(ctx) {
    let s = ctx.settings
    const stats = { switched: 0, lastSwitch: null, eq: 'aus', eqError: null }
    let lastTry = { videoId: null, at: 0 }
    let graph = null

    const switchAudio = () => {
      if (!s.preferAudio) return
      const t = currentTrack()
      const toggle = document.querySelector('ytmusic-player-page ytmusic-av-toggle')
      if (!toggle || !t) return
      if (!toggle.hasAttribute('audio-only-playback-available')) return
      if (toggle.getAttribute('is-video-playback-mode-selected') !== 'true') return
      if (lastTry.videoId === t.videoId && Date.now() - lastTry.at < 10000) return
      lastTry = { videoId: t.videoId, at: Date.now() }
      const btn = toggle.querySelector('.song-button, [class*="song-button"], button:first-of-type')
      if (btn) {
        btn.click()
        stats.switched++
        stats.lastSwitch = t.title
      }
    }

    const ensureGraph = () => {
      if (!s.eq) return applyEq()
      const el = mediaEl()
      if (!el) return
      try {
        if (!graph || graph.el !== el) {
          const ac = graph?.ac || new AudioContext()
          const src = ac.createMediaElementSource(el)
          const pre = ac.createGain()
          const filters = EQ_BANDS.map((f, i) => {
            const b = ac.createBiquadFilter()
            b.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
            b.frequency.value = f
            b.Q.value = 1
            return b
          })
          src.connect(pre)
          let node = pre
          for (const f of filters) {
            node.connect(f)
            node = f
          }
          node.connect(ac.destination)
          graph = { ac, el, src, pre, filters }
        }
        if (graph.ac.state === 'suspended') graph.ac.resume().catch(() => {})
        applyEq()
      } catch (e) {
        stats.eqError = e.message
      }
    }

    const applyEq = () => {
      if (!graph) return
      const gains = EQ_PRESETS[s.eq] || EQ_PRESETS.flat
      graph.filters.forEach((f, i) => (f.gain.value = s.eq ? gains[i] : 0))
      graph.pre.gain.value = s.eq ? Math.pow(10, (s.preamp || 0) / 20) : 1
      stats.eq = s.eq || 'aus (neutral durchgeleitet)'
    }

    const resume = () => graph?.ac.state === 'suspended' && graph.ac.resume().catch(() => {})
    const offs = [listen(document, 'pointerdown', resume, true), listen(document, 'keydown', resume, true)]
    const timer = setInterval(() => {
      switchAudio()
      if (s.eq || graph) ensureGraph()
    }, 1500)

    return {
      stats,
      update(next) {
        s = next
        ensureGraph()
      },
      onVideo() {
        setTimeout(switchAudio, 800)
      },
      dispose() {
        clearInterval(timer)
        for (const off of offs) off()
        // quelle bleibt an web audio gebunden, daher nur neutral stellen
        if (graph) {
          graph.filters.forEach((f) => (f.gain.value = 0))
          graph.pre.gain.value = 1
        }
      },
      health() {
        const toggle = document.querySelector('ytmusic-player-page ytmusic-av-toggle')
        const parts = [`${stats.switched} Mal auf Audio umgeschaltet`]
        if (!toggle) parts.push('kein Titel/Video-Umschalter sichtbar')
        if (s.eq || graph) parts.push(`EQ ${stats.eq}${graph ? ` · AudioContext ${graph.ac.state}` : ''}`)
        if (stats.eqError) return { status: 'warn', detail: `EQ-Fehler: ${stats.eqError}` }
        return { status: 'ok', detail: parts.join(' · ') }
      }
    }
  }
}
