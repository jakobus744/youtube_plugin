import { watch } from '../registry/paths.js'
import { player } from '../core/bridge.js'
import { formatDate, formatTimeOfDay, clock } from '../core/format.js'
import { listen } from '../core/lifecycle.js'
import { h, button, showMenu, toast, textDialog } from './ui.js'
import { videoLink } from './transcript/formats.js'

export const endsAt = {
  id: 'player.endsAt',
  label: 'Endzeit im Player',
  group: 'Videoseite',
  description: '„endet 21:47“ neben der Zeitanzeige, rechnet Geschwindigkeit mit ein',
  pages: ['watch'],
  stability: 'hoch',
  anchors: ['player.timeDisplay'],
  settings: {
    showRemaining: { type: 'toggle', label: 'Restzeit anzeigen (−12:34)', default: false },
    speedAdjusted: { type: 'toggle', label: 'Geschwindigkeit berücksichtigen', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    let lastText = ''
    const text = () => {
      const p = player()
      if (!p) return ''
      const vd = p.getVideoData?.()
      if (vd?.isLive || p.classList?.contains('ad-showing')) return ''
      const dur = p.getDuration?.() || 0
      const cur = p.getCurrentTime?.() || 0
      if (!dur) return ''
      const r = s.speedAdjusted ? p.getPlaybackRate?.() || 1 : 1
      const left = Math.max(0, (dur - cur) / r)
      const end = formatTimeOfDay(new Date(Date.now() + left * 1000))
      return `${s.showRemaining ? ` · −${clock(left)}` : ''} · endet ${end}`
    }
    const m = ctx.mount({
      id: 'player.endsAt',
      anchor: 'player.timeDisplay',
      position: 'append',
      when: () => ctx.nav.page === 'watch',
      create: () => h('span', { class: 'ytx-inline', style: { color: 'inherit', font: 'inherit', whiteSpace: 'nowrap' } }),
      update: (node) => {
        const t = text()
        if (t !== lastText) node.textContent = lastText = t
      }
    })
    let tick = 0
    const off = listen(document, 'timeupdate', (e) => {
      if (!e.target?.closest?.('#movie_player')) return
      const now = Date.now()
      if (now - tick < 1000) return
      tick = now
      m.refresh()
    }, true)
    const off2 = listen(document, 'ratechange', () => m.refresh(), true)
    return {
      update(next) {
        s = next
        lastText = ''
        m.refresh()
      },
      dispose() {
        off()
        off2()
        m.destroy()
      },
      health: () => (m.ok ? { status: 'ok', detail: lastText.trim() || 'wartet auf Wiedergabe' } : { status: 'warn', detail: 'Zeitanzeige im Player nicht gefunden' })
    }
  }
}

export const publishDate = {
  id: 'watch.publishDate',
  label: 'Exaktes Veröffentlichungsdatum',
  group: 'Videoseite',
  description: 'Zeigt das Datum unter dem Video statt nur „vor 3 Jahren“',
  pages: ['watch'],
  stability: 'mittel-hoch',
  anchors: ['watch.titleRow'],
  settings: {
    withTime: { type: 'toggle', label: 'Mit Uhrzeit', default: false }
  },
  setup(ctx) {
    let s = ctx.settings
    let shown = ''
    const m = ctx.mount({
      id: 'watch.publishDate',
      anchor: 'watch.titleRow',
      position: 'append',
      when: () => ctx.nav.page === 'watch' && !!watch.publishDate(),
      create: () => h('div', { class: 'ytx-note', style: { marginTop: '4px' } }),
      update: (node) => {
        const pr = watch.playerResponse()
        if (pr?.videoDetails?.videoId !== ctx.nav.videoId) return
        const iso = watch.publishDate(pr)
        const t = iso ? `Veröffentlicht am ${formatDate(iso, s.withTime && /T/.test(iso))}` : ''
        if (t !== shown) node.textContent = shown = t
      }
    })
    return {
      onVideo: () => m.refresh(),
      update(next) {
        s = next
        shown = ''
        m.refresh()
      },
      dispose: () => m.destroy(),
      health: () => (m.ok ? { status: 'ok', detail: shown } : { status: watch.publishDate() ? 'warn' : 'skip', detail: watch.publishDate() ? 'Anker unter dem Titel fehlt' : 'Kein Datum in Player-Daten' })
    }
  }
}

export const copyInfo = {
  id: 'watch.copyInfo',
  label: 'Kapitel, Beschreibung und Link kopieren',
  group: 'Videoseite',
  description: 'Kleiner Kopieren-Button in der Aktionsleiste, funktioniert auch ohne Transkript',
  pages: ['watch'],
  stability: 'mittel-hoch',
  anchors: ['watch.actions'],
  settings: {
    linkFormat: { type: 'select', label: 'Links als', options: [['markdown', 'Markdown'], ['plain', 'Nur URL']], default: 'markdown' }
  },
  hotkeys: [['info.linkHere', 'Link an aktueller Stelle kopieren', 'Alt+L']],
  setup(ctx) {
    let s = ctx.settings
    const meta = () => {
      const pr = watch.playerResponse()
      const vd = pr?.videoDetails || {}
      return { id: ctx.nav.videoId, title: vd.title || document.title.replace(/ - YouTube$/, ''), author: vd.author || '', pr }
    }
    const done = async (text, what) => {
      if (!text) return toast(`${what}: nichts vorhanden`, 'error')
      if (await ctx.copyText(text)) toast(`${what} kopiert`)
      else textDialog(what, text)
    }
    const link = (title, sec) => (s.linkFormat === 'markdown' ? `[${title}](${videoLink(meta().id, sec)})` : videoLink(meta().id, sec))
    const chaptersText = (md) => {
      const m = meta()
      const ch = watch.chapters()
      if (!ch.length) return null
      return ch.map((c) => (md ? `- [${clock(c.startSec)}](${videoLink(m.id, c.startSec)}) ${c.title}` : `${clock(c.startSec)} ${c.title}`)).join('\n')
    }
    const linkHere = () => {
      const t = Math.floor(player()?.getCurrentTime?.() || 0)
      done(link(`${meta().title} @ ${clock(t)}`, t), `Link bei ${clock(t)}`)
    }
    ctx.action('info.linkHere', () => ctx.nav.page === 'watch' && linkHere())

    const open = (anchor) => {
      const m = meta()
      const hasChapters = watch.chapters().length > 0
      showMenu(anchor, [
        { title: 'Kopieren' },
        { label: 'Titel mit Link', run: () => done(link(m.title), 'Link') },
        { label: 'Link an aktueller Stelle', sub: 'Alt+L', run: linkHere },
        { label: 'Kapitel (Text)', disabled: !hasChapters, run: () => done(chaptersText(false), 'Kapitel') },
        { label: 'Kapitel (Markdown mit Zeitlinks)', disabled: !hasChapters, run: () => done(`## ${m.title}\n\n${chaptersText(true)}\n`, 'Kapitel') },
        { label: 'Beschreibung', run: () => done(watch.description(m.pr), 'Beschreibung') }
      ])
    }
    const mt = ctx.mount({
      id: 'actions.copyInfo',
      anchor: 'watch.actions',
      position: 'before',
      when: () => ctx.nav.page === 'watch',
      create: () => {
        const b = button({ icon: '⎘', title: 'Titel, Link, Kapitel oder Beschreibung kopieren', onClick: () => open(b) })
        b.style.marginLeft = '8px'
        return b
      }
    })
    return {
      update(next) {
        s = next
      },
      dispose: () => mt.destroy(),
      health: () => (mt.ok ? { status: 'ok', detail: `${watch.chapters().length} Kapitel erkannt` } : { status: 'warn', detail: 'Aktionsleiste nicht gefunden' })
    }
  }
}
