import { readPlaylist, summarize, loadAll, isLoading } from './common.js'
import { playlistPanel } from '../../registry/paths.js'
import { formatDuration } from '../../core/format.js'
import { player } from '../../core/bridge.js'
import { h, clear } from '../ui.js'

export default {
  id: 'playlist.duration',
  label: 'Playlist-Dauer',
  group: 'Playlist',
  description: 'Gesamtdauer, gesehene und verbleibende Zeit auf Playlist-Seiten und im Playlist-Panel neben Videos',
  pages: ['playlist', 'watch'],
  stability: 'mittel-hoch',
  anchors: ['playlist.header', 'watch.playlistHeader'],
  settings: {
    show: { type: 'multi', label: 'Anzeigen', options: [['total', 'Gesamt'], ['watched', 'Gesehen'], ['remaining', 'Übrig']], default: ['total', 'remaining'] },
    doneThreshold: { type: 'range', label: 'Gilt als gesehen ab', min: 50, max: 100, step: 5, unit: '%', default: 90 },
    speed: { type: 'select', label: 'Zusätzlich umgerechnet auf', options: [['', 'Aus'], ['player', 'Aktuelle Player-Geschwindigkeit'], ['1.25', '1,25×'], ['1.5', '1,5×'], ['1.75', '1,75×'], ['2', '2×']], default: '' },
    panelFromHere: { type: 'toggle', label: 'Im Playlist-Panel: Rest ab aktuellem Video', default: true },
    autoLoadAll: { type: 'toggle', label: 'Große Playlists automatisch komplett laden', default: false },
    longFormat: { type: 'select', label: 'Lange Dauer als', options: [['hours', 'Stunden (27 h)'], ['days', 'Tage (1 d 3 h)']], default: 'hours' }
  },

  setup(ctx) {
    let s = ctx.settings
    let last = null
    let autoTriedFor = null

    const rate = () => {
      if (!s.speed) return null
      if (s.speed === 'player') {
        const r = player()?.getPlaybackRate?.()
        return r && r !== 1 ? r : null
      }
      return Number(s.speed)
    }
    const fmt = (sec) => formatDuration(sec, { long: s.longFormat })

    function statsParts(sum, complete, approx) {
      const pre = complete ? '' : '≥ '
      const parts = []
      if (s.show.includes('total')) parts.push([`${pre}${fmt(sum.total)}`, 'gesamt'])
      if (s.show.includes('watched') && sum.withProgress) parts.push([`~${fmt(sum.watched)}`, 'gesehen'])
      if (s.show.includes('remaining')) parts.push([`${approx && sum.withProgress ? '~' : pre}${fmt(sum.remaining)}`, 'übrig'])
      const r = rate()
      if (r) parts.push([`${pre}${fmt(sum.remaining / r)}`, `bei ${String(r).replace('.', ',')}×`])
      return parts
    }

    function renderPage(node) {
      const data = readPlaylist()
      const sum = summarize(data.items, s)
      last = { ...sum, loaded: data.items.length, expected: data.total, complete: data.complete, kind: data.kind }
      clear(node)
      node.append(h('span', { text: '⏱' }))
      for (const [val, label] of statsParts(sum, data.complete, true)) node.append(h('span', null, h('b', { text: val }), ` ${label}`))
      if (sum.unavailable) node.append(h('span', { text: `${sum.unavailable} ohne Dauer` }))
      if (sum.live) node.append(h('span', { text: `${sum.live} live` }))
      if (!data.complete) {
        node.append(h('span', { text: `${data.items.length}${data.total ? ` / ${data.total}` : ''} geladen` }))
        if (isLoading()) node.append(h('span', { text: 'lädt …' }))
        else {
          const link = h('button', { class: 'ytx-link', type: 'button', text: 'Alle laden' })
          link.addEventListener('click', (e) => {
            e.preventDefault()
            startLoad(node)
          })
          node.append(link)
        }
      }
    }

    async function startLoad(node) {
      renderPage(node)
      await loadAll(() => renderPage(node))
      renderPage(node)
    }

    function renderPanel(node) {
      const d = playlistPanel.read()
      if (!d || !d.items.length) {
        clear(node)
        return
      }
      const maxIndex = Math.max(...d.items.map((i) => i.index))
      const minIndex = Math.min(...d.items.map((i) => i.index))
      const total = d.total ?? d.items.length
      const cur = d.current ?? 0
      const complete = !d.infinite && maxIndex >= total - 1
      const all = summarize(d.items.map((i) => ({ ...i, unavailable: !i.durationSec })), s)
      const rest = d.items.filter((i) => i.index >= cur)
      let restSec = rest.reduce((n, i) => n + (i.durationSec || 0), 0)
      const t = player()?.getCurrentTime?.() || 0
      if (rest.find((i) => i.index === cur)?.durationSec) restSec -= Math.min(t, rest.find((i) => i.index === cur).durationSec)
      const pre = complete ? '' : '≥ '
      clear(node)
      const parts = []
      if (s.panelFromHere) parts.push([`${pre}${fmt(restSec)}`, 'ab hier'])
      if (s.show.includes('total')) parts.push([`${complete && minIndex === 0 ? '' : '≥ '}${fmt(all.total)}`, 'gesamt'])
      const r = rate()
      if (r && s.panelFromHere) parts.push([`${pre}${fmt(restSec / r)}`, `bei ${String(r).replace('.', ',')}×`])
      node.append(h('span', { text: '⏱' }), ...parts.map(([v, l]) => h('span', null, h('b', { text: v }), ` ${l}`)))
      last = { panel: true, restSec, loaded: d.items.length, expected: total, complete }
    }

    const pageMount = ctx.mount({
      id: 'playlist.duration',
      anchor: 'playlist.header',
      position: 'after',
      when: () => ctx.nav.page === 'playlist',
      create: () => h('div', { class: 'ytx-note', style: { display: 'flex', margin: '8px 0' } }),
      update: (node) => {
        if (!isLoading()) renderPage(node)
      }
    })

    const panelMount = ctx.mount({
      id: 'watch.playlist.duration',
      anchor: 'watch.playlistHeader',
      position: 'append',
      when: () => ctx.nav.page === 'watch' && !!playlistPanel.read(),
      create: () => h('div', { class: 'ytx-note', style: { display: 'flex', marginTop: '4px' } }),
      update: (node) => renderPanel(node)
    })

    // rest ab hier laeuft mit der wiedergabe mit
    const iv = setInterval(() => {
      if (ctx.nav.page === 'watch' && panelMount.node?.isConnected) renderPanel(panelMount.node)
    }, 5000)

    return {
      onSweep() {
        if (s.autoLoadAll && ctx.nav.page === 'playlist' && autoTriedFor !== ctx.nav.url && pageMount.node?.isConnected) {
          autoTriedFor = ctx.nav.url
          const d = readPlaylist()
          if (!d.complete && d.items.length) startLoad(pageMount.node)
        }
      },
      update(next) {
        s = next
        pageMount.refresh()
        panelMount.refresh()
      },
      dispose() {
        clearInterval(iv)
        pageMount.destroy()
        panelMount.destroy()
      },
      health() {
        if (ctx.nav.page === 'playlist') {
          if (!pageMount.ok) return { status: 'fail', detail: 'Anker im Playlist-Kopf nicht gefunden' }
          if (!last || !last.loaded) return { status: 'warn', detail: 'Keine Einträge erkannt' }
          return { status: 'ok', detail: `${last.kind === 'lockup' ? 'neue Komponenten' : 'Polymer'} · ${last.loaded}${last.expected ? `/${last.expected}` : ''} geladen · ${fmt(last.total ?? 0)} · ${last.complete ? 'vollständig' : 'teilweise'} · ${last.unavailable} ohne Dauer` }
        }
        if (!playlistPanel.read()) return { status: 'skip', detail: 'Keine Playlist im Video' }
        return panelMount.ok ? { status: 'ok', detail: `Panel · ${last?.loaded ?? 0}/${last?.expected ?? '?'} Einträge` } : { status: 'warn', detail: 'Anker im Playlist-Panel fehlt' }
      },
      debug: { readPlaylist, loadAll: () => loadAll(), last: () => last }
    }
  }
}
