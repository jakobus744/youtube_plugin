import { listTracks, pickTrack, fetchTrack, sourceStats, hasToken } from './source.js'
import { parseJson3, cleanSegments, toParagraphs, render, stats, FORMAT_LABELS, videoLink } from './formats.js'
import { watch, videoMenu, CARD_SELECTORS, readCard } from '../../../registry/youtube/paths.js'
import { splitButton, button, showMenu, toast, setButtonBusy, textDialog } from '../../ui.js'
import { clock } from '../../../core/format.js'
import { player } from '../../../core/bridge.js'
import { h, qs, qsa, isVisible } from '../../../core/dom.js'
import { waitFor } from '../../../core/scheduler.js'
import { PANEL_HIDE_CSS } from './panelSource.js'

const FORMATS = Object.entries(FORMAT_LABELS)
const PENDING = 'ytx.transcript.pending'

const MENU_CSS = `.ytx-menu-item { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 36px; box-sizing: border-box; padding: 0 36px 0 16px; border: 0; background: none; cursor: pointer; text-align: left;
  font: 400 14px/20px Roboto, Arial, sans-serif; color: var(--yt-spec-text-primary, #f1f1f1); }
.ytx-menu-item:hover, .ytx-menu-item:focus-visible { background: var(--yt-spec-10-percent-layer, rgba(255,255,255,.1)); outline: none; }
.ytx-menu-item svg { width: 24px; height: 24px; flex: none; fill: currentColor; }`

function menuIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2Zm0 2v12h14V6H5Zm2 3h10v2H7V9Zm0 4h6v2H7v-2Z')
  svg.append(path)
  return svg
}

function readPending() {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null')
    return p && Date.now() - p.at < 60000 ? p : null
  } catch {
    return null
  }
}

function savePending(p) {
  try {
    if (p) sessionStorage.setItem(PENDING, JSON.stringify(p))
    else sessionStorage.removeItem(PENDING)
  } catch {}
}

export default {
  id: 'transcript.copy',
  label: 'Transkript kopieren',
  group: 'Videoseite',
  description: 'Komplettes Transkript mit einem Klick in die Zwischenablage. Button erscheint nur, wenn das Video Untertitel hat. Im Drei-Punkte-Menü einer Videokachel öffnet es das Video und kopiert, sobald es geladen ist',
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
    placement: { type: 'multi', label: 'Button-Position', options: [['actions', 'Aktionsleiste'], ['panel', 'Transkript-Panel'], ['menu', 'Drei-Punkte-Menü']], default: ['actions', 'panel', 'menu'] },
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

    // ---------- drei punkte menue ----------

    let menuFor = null
    let pending = readPending()

    const closeMenu = () => {
      const dd = qsa(videoMenu.popup).find(isVisible)
      try { dd?.close?.() } catch {}
      if (isVisible(dd)) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    }

    async function fromMenu() {
      const target = menuFor
      closeMenu()
      if (!target) return
      if (ctx.nav.page === 'watch' && target.videoId === ctx.nav.videoId) {
        refreshTracks()
        return copy()
      }
      // fremde videos liefern ihre untertitel nur im player, also erst oeffnen
      pending = { videoId: target.videoId, at: Date.now() }
      savePending(pending)
      toast('Video wird geöffnet, das Transkript wird danach kopiert')
      const link = target.card?.isConnected && qs('a[href*="/watch?"]', target.card)
      if (link) link.click()
      else location.assign(`/watch?v=${target.videoId}`)
    }

    function checkPending() {
      if (!pending || busy || ctx.nav.videoId !== pending.videoId) return
      refreshTracks()
      if (tracks.length) {
        pending = null
        savePending(null)
        copy()
      } else if (Date.now() - pending.at > 20000) {
        pending = null
        savePending(null)
        toast('Für dieses Video gibt es kein Transkript', 'error')
      }
    }

    const addItem = (list) => {
      const item = h('div', { class: 'ytx-menu-item', role: 'menuitem', tabindex: '0' }, menuIcon(), h('span', { text: 'Transkript kopieren' }))
      item.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        fromMenu()
      })
      list.append(item)
      // youtube legt die hoehe beim oeffnen fest, sonst kommt ein scrollbalken
      const pop = list.closest('ytd-menu-popup-renderer')
      if (pop?.style.maxHeight) pop.style.maxHeight = `${parseFloat(pop.style.maxHeight) + item.offsetHeight}px`
      try { list.closest('tp-yt-iron-dropdown')?.refit?.() } catch {}
    }

    // youtube nutzt dasselbe popup fuer alle menues, eigener eintrag nur bei videos
    const onMenuClick = (e) => {
      const t = e.target instanceof Element ? e.target : null
      if (!t || t.closest(videoMenu.popup) || !t.closest('button, yt-icon-button')) return
      for (const old of qsa('.ytx-menu-item')) old.remove()
      menuFor = null
      if (!s.placement.includes('menu')) return
      const card = t.closest(CARD_SELECTORS.join(', '))
      let videoId = null
      if (card) {
        const c = readCard(card)
        if (c?.kind === 'video' && !c.live) videoId = c.videoId
      } else if (ctx.nav.page === 'watch' && t.closest(videoMenu.watchOwn)) videoId = ctx.nav.videoId
      if (!videoId) return
      menuFor = { videoId, card }
      waitFor(() => videoMenu.lists.map((sel) => qsa(sel).find(isVisible)).find(Boolean), { timeout: 2500, interval: 60 }).then((list) => {
        if (list && menuFor?.videoId === videoId && !qs('.ytx-menu-item', list)) addItem(list)
      })
    }
    document.addEventListener('click', onMenuClick, true)

    ctx.action('transcript.copy', () => available() && copy())
    ctx.action('transcript.quote', () => available() && quote())
    ctx.css(`${PANEL_HIDE_CSS}\n${MENU_CSS}`)
    mountAll()

    return {
      onVideo() {
        refreshTracks()
        mounts.forEach((m) => m.refresh())
        checkPending()
      },
      onSweep() {
        const before = tracks.length
        refreshTracks()
        if (before !== tracks.length) mounts.forEach((m) => m.refresh())
        checkPending()
      },
      update(next) {
        const placementChanged = JSON.stringify(next.placement) !== JSON.stringify(s.placement)
        s = next
        if (placementChanged) mountAll()
      },
      dispose() {
        mounts.forEach((m) => m.destroy())
        document.removeEventListener('click', onMenuClick, true)
        for (const old of qsa('.ytx-menu-item')) old.remove()
      },
      health() {
        refreshTracks()
        if (!ctx.nav.videoId) return { status: 'skip', detail: 'Kein Video' }
        if (!tracks.length) return { status: 'skip', detail: 'Video hat keine Untertitel, Button bleibt ausgeblendet' }
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
