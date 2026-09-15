import { readPlaylist, loadAll, isLoading } from './common.js'
import { playlistPage } from '../../../registry/youtube/paths.js'
import { h } from '../../ui.js'
import { qs, qsa } from '../../../core/dom.js'
import { toast } from '../../ui.js'

// sortiert nur die anzeige ueber css order
// youtube listen werden nie umgebaut und nichts wird bei youtube gespeichert

const SORTS = [
  ['', 'Reihenfolge: Original'],
  ['duration-asc', 'Dauer: kurz zuerst'],
  ['duration-desc', 'Dauer: lang zuerst'],
  ['progress-asc', 'Fortschritt: ungesehen zuerst'],
  ['progress-desc', 'Fortschritt: angefangen zuerst'],
  ['title', 'Titel A–Z'],
  ['channel', 'Kanal A–Z'],
  ['reverse', 'Umgekehrt']
]

const cmpText = (a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })

function sorter(key) {
  switch (key) {
    case 'duration-asc':
      return (a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity)
    case 'duration-desc':
      return (a, b) => (b.durationSec ?? -1) - (a.durationSec ?? -1)
    case 'progress-asc':
      return (a, b) => (a.percent ?? 0) - (b.percent ?? 0)
    case 'progress-desc':
      return (a, b) => (b.percent ?? 0) - (a.percent ?? 0)
    case 'title':
      return (a, b) => cmpText(a.title || '', b.title || '')
    case 'channel':
      return (a, b) => cmpText(a.channel || '', b.channel || '') || (a.index ?? 0) - (b.index ?? 0)
    case 'reverse':
      return (a, b) => (b.index ?? 0) - (a.index ?? 0)
    default:
      return null
  }
}

export default {
  id: 'playlist.sort',
  label: 'Playlist sortieren (nur Anzeige)',
  group: 'Playlist',
  description: 'Sortiert die Anzeige von Playlists und „Später ansehen“. Bei YouTube wird nichts verändert',
  pages: ['playlist'],
  stability: 'mittel',
  settings: {
    loadBeforeSort: { type: 'toggle', label: 'Vor dem Sortieren alle Einträge laden', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    let key = ''
    let applied = 0
    ctx.css(`
[data-ytx-sorted] { display: flex !important; flex-direction: column !important; }
${playlistPage.dragHandles} { visibility: hidden !important; }
[data-ytx-sorted] ytd-playlist-video-renderer #reorder { visibility: hidden !important; }`)

    const reset = () => {
      for (const c of qsa('[data-ytx-sorted]')) {
        c.removeAttribute('data-ytx-sorted')
        for (const child of c.children) child.style.removeProperty('order')
      }
      applied = 0
    }

    const apply = () => {
      if (!key) return reset()
      const data = readPlaylist()
      const container = playlistPage.listContainer(data.kind)
      if (!container) return
      const cmp = sorter(key)
      const sorted = data.items.slice().sort((a, b) => cmp(a, b) || (a.index ?? 0) - (b.index ?? 0))
      container.setAttribute('data-ytx-sorted', key)
      sorted.forEach((it, i) => it.wrapper.style.setProperty('order', String(i)))
      // nachlade element bleibt unten
      for (const child of container.children) if (!child.style.order) child.style.setProperty('order', '999999')
      applied = sorted.length
    }

    const select = h('select', { class: 'ytx-btn ytx-small', title: 'Anzeige sortieren', style: { paddingRight: '8px' } }, SORTS.map(([v, l]) => h('option', { value: v, text: l })))
    select.addEventListener('change', async () => {
      key = select.value
      if (key && s.loadBeforeSort && !readPlaylist().complete) {
        select.disabled = true
        toast('Lade alle Einträge zum Sortieren …')
        await loadAll()
        select.disabled = false
      }
      apply()
    })

    const mount = ctx.mount({
      id: 'playlist.sort',
      anchor: 'playlist.header',
      position: 'after',
      when: () => ctx.nav.page === 'playlist',
      create: () => h('div', { style: { margin: '4px 0 8px' } }, select)
    })

    return {
      onPage() {
        key = ''
        select.value = ''
        reset()
      },
      onLeave() {
        reset()
      },
      onSweep() {
        if (key && !isLoading()) apply()
      },
      update(next) {
        s = next
      },
      dispose() {
        reset()
        mount.destroy()
        ctx.css('')
      },
      health: () => (qs('ytd-browse[page-subtype="playlist"]') ? { status: mount.ok ? 'ok' : 'warn', detail: key ? `${applied} Einträge sortiert (${key})` : 'Original-Reihenfolge' } : { status: 'skip' })
    }
  }
}
