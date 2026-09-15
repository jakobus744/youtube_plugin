import { listTracks, pickTrack, fetchTrack, sourceStats, hasToken } from './source.js'
import { parseJson3, cleanSegments, toParagraphs, render, stats, FORMAT_LABELS, videoLink } from './formats.js'
import { watch } from '../../../registry/youtube/paths.js'
import { splitButton, button, showMenu, toast, setButtonBusy, textDialog } from '../../ui.js'
import { clock } from '../../../core/format.js'
import { player } from '../../../core/bridge.js'
import { PANEL_HIDE_CSS } from './panelSource.js'

const FORMATS = Object.entries(FORMAT_LABELS)

export default {
  id: 'transcript.copy',
  label: 'Transkript kopieren',
  group: 'Videoseite',
  description: 'Komplettes Transkript mit einem Klick in die Zwischenablage. Button erscheint nur, wenn das Video Untertitel hat',
  pages: ['watch'],
  stability: 'mittel',
  anchors: ['watch.actions', 'transcript.panelHeader'],
  settings: {
    format: { type: 'select', label: 'Standardformat', options: FORMATS, default: 'markdown' },
    language: { type: 'select', label: 'Sprache', options: [['auto', 'Automatisch (Player / Originalsprache)'], ['original', 'Originalsprache'], ['ui', 'Oberflächensprache'], ['de', 'Deutsch'], ['en', 'Englisch']], default: 'auto' },
    preferManual: { type: 'toggle', label: 'Manuelle Untertitel bevorzugen', default: true },
    paragraphs: { type: 'select', label: 'Absätze', options: [['none', 'Keine'], ['pause', 'Bei Sprechpausen'], ['chapters', 'Nach Kapiteln (sonst Pausen)']], default: 'chapters' },
    pauseMs: { type: 'range', label: 'Pause für neuen Absatz', min: 500, max: 6000, step: 250, unit: 'ms', default: 1500 },
    timestampEvery: { type: 'select', label: 'Zeitstempel', options: [['paragraph', 'Pro Absatz'], ['segment', 'Pro Untertitelzeile']], default: 'paragraph' },
    header: { type: 'toggle', label: 'Titel, Kanal und Link voranstellen', default: true },
    stripTags: { type: 'toggle', label: '[Musik], [Applaus] entfernen', default: true },
    speakerHeuristic: { type: 'toggle', label: 'Sprecherwechsel (>>) als Absatz', default: true },
    placement: { type: 'multi', label: 'Button-Position', options: [['actions', 'Aktionsleiste'], ['panel', 'Transkript-Panel']], default: ['actions', 'panel'] },
    showStats: { type: 'toggle', label: 'Wortzahl und Lesezeit anzeigen', default: true }
  },
  hotkeys: [
    ['transcript.copy', 'Transkript kopieren', 'Alt+T'],
    ['transcript.quote', 'Aktuelle Stelle zitieren', 'Alt+Q']
  ],

  setup(ctx) {
    let s = ctx.settings
    let tracks = []
    let chosen = new Map()
    let lastStats = null
    let lastError = null
    let busy = false

    const available = () => ctx.nav.page === 'watch' && tracks.length > 0

    const refreshTracks = () => {
      const pr = watch.playerResponse()
      const vid = ctx.nav.videoId
      const prVid = pr?.videoDetails?.videoId
      // player response kann kurz noch vom vorherigen video sein
      tracks = prVid && prVid === vid ? listTracks(pr) : []
    }

    const currentTrack = () => chosen.get(ctx.nav.videoId) || pickTrack(tracks, s)

    async function buildDoc(track, onStatus) {
      const vid = ctx.nav.videoId
      const json = await fetchTrack(vid, track, { onStatus })
      const pr = watch.playerResponse()
      const vd = pr?.videoDetails || {}
      const segsRaw = parseJson3(json)
      const segs = cleanSegments(segsRaw, s)
      const chapters = s.paragraphs === 'chapters' ? watch.chapters() : []
      const paras = toParagraphs(segs, { mode: s.paragraphs === 'none' ? 'none' : s.paragraphs, pauseMs: s.pauseMs, chapters })
      const meta = {
        videoId: vid,
        title: vd.title || document.title.replace(/ - YouTube$/, ''),
        author: vd.author,
        channelUrl: vd.channelId ? `https://www.youtube.com/channel/${vd.channelId}` : '',
        publishDate: watch.publishDate(pr),
        durationSec: Number(vd.lengthSeconds) || null,
        trackLabel: track.label
      }
      lastStats = { ...stats(segs), segments: segs.length, track: track.label, video: vid }
      return { meta, segs, paras }
    }

    async function copy(format = s.format, track = currentTrack(), btn) {
      if (busy) return
      if (!track) return toast('Für dieses Video gibt es kein Transkript', 'error')
      busy = true
      if (btn) setButtonBusy(btn, true, 'Lädt …')
      try {
        const doc = await buildDoc(track, (label) => btn && setButtonBusy(btn, true, label))
        if (!doc.segs.length) throw new Error('Transkript ist leer')
        const text = render(format, doc, s)
        const ok = await ctx.copyText(text)
        lastError = null
        const extra = s.showStats ? ` · ${lastStats.words.toLocaleString('de-DE')} Wörter · ~${lastStats.readingMin} min Lesezeit` : ''
        if (ok) toast(`Kopiert: ${FORMAT_LABELS[format]}${extra}`)
        else textDialog(`Transkript (${FORMAT_LABELS[format]})`, text)
      } catch (e) {
        lastError = e.message
        ctx.log.warn('transcript', e)
        toast(e.message, 'error', 4000)
      } finally {
        busy = false
        if (btn) setButtonBusy(btn, false)
      }
    }

    async function quote() {
      const track = currentTrack()
      if (!track) return toast('Kein Transkript für dieses Video', 'error')
      const t = (player()?.getCurrentTime?.() || 0) * 1000
      try {
        const doc = await buildDoc(track)
        const i = doc.segs.findIndex((x) => x.endMs >= t)
        const pick = doc.segs.slice(Math.max(0, i - 1), i + 2)
        if (!pick.length) throw new Error('Keine Zeile an dieser Stelle')
        const start = pick[0].startMs / 1000
        const text = `> ${pick.map((x) => x.text).join(' ')}\n> — [${doc.meta.title} @ ${clock(start)}](${videoLink(doc.meta.videoId, start)})\n`
        if (await ctx.copyText(text)) toast(`Zitat bei ${clock(start)} kopiert`)
        else textDialog('Zitat', text)
      } catch (e) {
        toast(e.message, 'error')
      }
    }

    function openMenu(anchor) {
      const cur = currentTrack()
      const items = [{ title: 'Kopieren als' }]
      for (const [id, label] of FORMATS) items.push({ label, sub: id === s.format ? 'Standard' : '', run: () => copy(id, cur, anchor.parentElement?.main) })
      items.push({ sep: true }, { label: 'Aktuelle Stelle zitieren', sub: 'Alt+Q', run: quote })
      if (tracks.length > 1) {
        items.push({ sep: true }, { title: 'Spur' })
        const sorted = [...tracks].sort((a, b) => a.auto - b.auto || a.label.localeCompare(b.label, 'de'))
        for (const t of sorted.slice(0, 40)) {
          items.push({ label: t.label, checked: t.id === cur?.id, run: () => chosen.set(ctx.nav.videoId, t) })
        }
      }
      if (lastStats && lastStats.video === ctx.nav.videoId) items.push({ sep: true }, { foot: `${lastStats.words.toLocaleString('de-DE')} Wörter · ~${lastStats.readingMin} min Lesezeit · ${lastStats.track}` })
      showMenu(anchor, items)
    }

    const mounts = []
    const mountAll = () => {
      for (const m of mounts.splice(0)) m.destroy()
      if (s.placement.includes('actions')) {
        mounts.push(
          ctx.mount({
            id: 'actions.transcript',
            anchor: 'watch.actions',
            position: 'before',
            when: available,
            create: () => {
              const sb = splitButton({ label: 'Transkript', icon: '⧉', title: 'Transkript kopieren (Alt+T)', onMain: () => copy(s.format, currentTrack(), sb.main), onMenu: (more) => openMenu(more) })
              return sb
            }
          })
        )
      }
      if (s.placement.includes('panel')) {
        mounts.push(
          ctx.mount({
            id: 'panel.transcript',
            anchor: 'transcript.panelHeader',
            position: 'append',
            when: available,
            create: () => {
              const b = button({ label: 'Kopieren', icon: '⧉', small: true, title: 'Komplettes Transkript kopieren', onClick: () => copy(s.format, currentTrack(), b) })
              b.style.marginLeft = '8px'
              return b
            }
          })
        )
      }
    }

    ctx.action('transcript.copy', () => available() && copy())
    ctx.action('transcript.quote', () => available() && quote())
    ctx.css(PANEL_HIDE_CSS)
    mountAll()

    return {
      onVideo() {
        refreshTracks()
        mounts.forEach((m) => m.refresh())
      },
      onSweep() {
        const before = tracks.length
        refreshTracks()
        if (before !== tracks.length) mounts.forEach((m) => m.refresh())
      },
      update(next) {
        const placementChanged = JSON.stringify(next.placement) !== JSON.stringify(s.placement)
        s = next
        if (placementChanged) mountAll()
      },
      dispose() {
        mounts.forEach((m) => m.destroy())
      },
      health() {
        refreshTracks()
        if (!ctx.nav.videoId) return { status: 'skip', detail: 'Kein Video' }
        if (!tracks.length) return { status: 'skip', detail: 'Video hat keine Untertitel – Button bleibt ausgeblendet' }
        const m = mounts.map((x) => `${x.ok ? '✓' : '✗'}`).join(' ')
        const token = hasToken(ctx.nav.videoId) ? 'Token vorhanden' : 'Token wird beim Kopieren angefordert'
        const err = lastError || sourceStats.lastError
        const method = sourceStats.lastMethod ? ` · zuletzt: ${sourceStats.lastMethod} (${sourceStats.lastMs} ms)` : ''
        return { status: err ? 'warn' : mounts.some((x) => x.ok) ? 'ok' : 'warn', detail: `${tracks.length} Spuren · ${token} · Buttons ${m}${method}${err ? ` · letzter Fehler: ${err}` : ''}` }
      },
      debug: { copy, buildDoc, currentTrack, tracks: () => tracks }
    }
  }
}
