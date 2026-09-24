import { readPlaylist, loadAll, isLoading } from './common.js'
import { playlistPanel } from '../../../registry/youtube/paths.js'
import { qsa } from '../../../core/dom.js'
import { debounce } from '../../../core/scheduler.js'
import { h } from '../../ui.js'

// suche nach titel oder kanal in playlists, blendet nicht passende eintraege nur aus

const ATTR = 'data-ytx-plhide'

// gross klein und akzente egal, alle woerter muessen vorkommen
export function norm(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

export function matches(item, query) {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = norm(`${item.title} ${item.channel}`)
  return words.every((w) => hay.includes(w))
}

function clearHidden() {
  for (const el of qsa(`[${ATTR}]`)) el.removeAttribute(ATTR)
}

export default {
  id: 'playlist.search',
  label: 'Playlist durchsuchen',
  group: 'Playlist',
  description: 'Suchfeld auf Playlist-Seiten und im Playlist-Panel neben Videos: filtert nach Videotitel oder Kanalname',
  pages: ['playlist', 'watch'],
  stability: 'mittel-hoch',
  anchors: ['playlist.header', 'watch.playlistHeader'],
  settings: {
    autoLoad: { type: 'toggle', label: 'Beim Suchen große Playlists komplett nachladen', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    const q = { page: '', panel: '' }
    const stats = { page: null, panel: null }
    ctx.css(`[${ATTR}] { display: none !important; }`)

    function applyPage() {
      const data = readPlaylist()
      let shown = 0
      for (const it of data.items) {
        const ok = matches(it, q.page)
        if (ok) shown++
        if (ok) it.wrapper.removeAttribute(ATTR)
        else it.wrapper.setAttribute(ATTR, '')
      }
      stats.page = { shown, loaded: data.items.length, total: data.total, complete: data.complete }
      return stats.page
    }

    function applyPanel() {
      let shown = 0
      let loaded = 0
      for (const el of playlistPanel.itemElements()) {
        const it = playlistPanel.readElement(el)
        if (!it) continue
        loaded++
        const ok = matches(it, q.panel)
        if (ok) shown++
        if (ok) el.removeAttribute(ATTR)
        else el.setAttribute(ATTR, '')
      }
      stats.panel = { shown, loaded }
      return stats.panel
    }

    function box(kind) {
      const input = h('input', { type: 'search', placeholder: 'In Playlist suchen: Titel oder Kanal', value: q[kind], spellcheck: 'false' })
      const info = h('span', { class: 'ytx-note' })
      Object.assign(input.style, { all: 'initial', boxSizing: 'border-box', flex: '1', minWidth: '0', height: '34px', padding: '0 12px', borderRadius: '17px', font: '400 14px Roboto, Arial, sans-serif', color: 'var(--yt-sys-color-baseline--text-primary, #f1f1f1)', background: 'var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.08))', border: '1px solid var(--yt-sys-color-baseline--outline, rgba(255,255,255,.15))' })
      const wrap = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: kind === 'page' ? '8px 0' : '6px 0 2px', maxWidth: '640px' } }, input, info)
      // youtube tastenkuerzel nicht beim tippen ausloesen
      for (const t of ['keydown', 'keyup', 'keypress']) input.addEventListener(t, (e) => e.key !== 'Escape' && e.stopPropagation())
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          input.value = ''
          run()
        }
      })
      const run = () => {
        q[kind] = input.value.trim()
        refresh(kind)
      }
      const later = debounce(run, 150)
      input.addEventListener('input', later)
      wrap.__info = info
      return wrap
    }

    const autoLoad = debounce(async () => {
      if (!s.autoLoad || !q.page || isLoading()) return
      const d = readPlaylist()
      if (d.complete) return
      await loadAll(() => refresh('page'))
      refresh('page')
    }, 700)

    function refresh(kind) {
      if (kind === 'page') {
        const st = applyPage()
        const info = pageMount.node?.__info
        if (info) {
          info.textContent = !q.page ? '' : `${st.shown} Treffer${st.complete ? '' : ` · ${isLoading() ? 'lädt weitere …' : `nur ${st.loaded}${st.total ? `/${st.total}` : ''} geladen`}`}`
        }
        if (q.page && !st.complete) autoLoad()
      } else {
        const st = applyPanel()
        const info = panelMount.node?.__info
        if (info) info.textContent = q.panel ? `${st.shown}/${st.loaded}` : ''
      }
    }

    const pageMount = ctx.mount({
      id: 'playlist.search',
      anchor: 'playlist.header',
      position: 'after',
      when: () => ctx.nav.page === 'playlist',
      create: () => box('page')
    })

    const panelMount = ctx.mount({
      id: 'watch.playlist.search',
      anchor: 'watch.playlistHeader',
      position: 'append',
      when: () => ctx.nav.page === 'watch' && !!playlistPanel.read(),
      create: () => box('panel')
    })

    return {
      // nachgeladene eintraege gleich mitfiltern
      onSweep() {
        if (q.page && ctx.nav.page === 'playlist') refresh('page')
        if (q.panel && ctx.nav.page === 'watch') refresh('panel')
      },
      onPage() {
        q.page = ''
        q.panel = ''
        clearHidden()
        for (const m of [pageMount, panelMount]) {
          const input = m.node?.querySelector('input')
          if (input) input.value = ''
          if (m.node?.__info) m.node.__info.textContent = ''
        }
      },
      update(next) {
        s = next
      },
      dispose() {
        clearHidden()
        pageMount.destroy()
        panelMount.destroy()
      },
      health() {
        if (ctx.nav.page === 'playlist') return pageMount.ok ? { status: 'ok', detail: stats.page && q.page ? `${stats.page.shown}/${stats.page.loaded} passend` : 'Suchfeld da' } : { status: 'warn', detail: 'Anker im Playlist-Kopf fehlt' }
        if (!playlistPanel.read()) return { status: 'skip', detail: 'Keine Playlist im Video' }
        return panelMount.ok ? { status: 'ok', detail: 'Suchfeld im Panel' } : { status: 'warn', detail: 'Anker im Playlist-Panel fehlt' }
      }
    }
  }
}
