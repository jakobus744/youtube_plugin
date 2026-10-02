import { currentTrack, currentBrowse, navigateEndpoint, endpoints } from '../../registry/music/player.js'
import { h } from '../../core/dom.js'
import { pageWindow } from '../../core/bridge.js'
import { catalog } from './data/catalog.js'
import { ytxQueue } from './ytxQueue.js'
import { parseArtistPage, parseCollectionPage } from '../../registry/music/parse.js'
import { music } from './runtime.js'
import { iconButton, pill } from './ui.js'
import { showMenu, toast } from '../ui.js'

// favoriten fuer songs kuenstler alben und playlists mit eigenem gewicht

function pageSubject() {
  const b = currentBrowse()
  if (!b) return null
  const id = b.browseId
  if (/^UC[\w-]{22}$/.test(id)) {
    const a = parseArtistPage(b.response, id)
    return a.name ? { type: 'artist', id, name: a.name, thumbnail: a.thumbnail || '' } : null
  }
  if (/^MPREb_/.test(id)) {
    const c = parseCollectionPage(b.response, { browseId: id })
    return c.title ? { type: 'album', id, name: c.title, artists: c.artists } : null
  }
  if (/^VL/.test(id)) {
    const c = parseCollectionPage(b.response, { browseId: id })
    return c.title ? { type: 'playlist', id: id.replace(/^VL/, ''), name: c.title } : null
  }
  return null
}

const TYPE_LABEL = { song: 'Song', artist: 'Künstler', album: 'Album', playlist: 'Playlist' }

// ---------- regal in der mediathek ----------

const LIB_TYPES = [['all', 'Alle'], ['artist', 'Künstler'], ['song', 'Songs'], ['album', 'Alben'], ['playlist', 'Playlists']]
const C = { primary: 'var(--ytmusic-text-primary, #fff)', secondary: 'var(--ytmusic-text-secondary, #aaa)' }

function openFav(f) {
  if (f.type === 'artist') navigateEndpoint(endpoints.browse(f.id, null, 'ARTIST'))
  else if (f.type === 'song') navigateEndpoint(endpoints.radio(f.id))
  else if (f.type === 'album') navigateEndpoint(endpoints.browse(f.id, null, 'ALBUM'))
  else if (f.type === 'playlist') navigateEndpoint(endpoints.browse(`VL${f.id}`, null, 'PLAYLIST'))
}

function favCard(f) {
  const round = f.type === 'artist'
  const sub = f.type === 'artist' ? 'Künstler' : [TYPE_LABEL[f.type], (f.artists || []).map((a) => a.name).join(', ')].filter(Boolean).join(' · ')
  const img = f.thumbnail
    ? h('img', { src: f.thumbnail, loading: 'lazy', alt: '', style: { width: '150px', height: '150px', borderRadius: round ? '50%' : '4px', objectFit: 'cover', background: 'rgba(255,255,255,.08)' } })
    : h('div', { text: (f.name || '?').slice(0, 1).toUpperCase(), style: { width: '150px', height: '150px', borderRadius: round ? '50%' : '4px', background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '500 48px Roboto, Arial, sans-serif', color: C.secondary } })
  const card = h('div', { title: f.name, style: { flex: 'none', width: '150px', cursor: 'pointer', color: C.primary, font: '400 13px/1.35 Roboto, Arial, sans-serif', textAlign: round ? 'center' : 'left' } },
    img,
    h('div', { text: `${(f.weight ?? 1) > 1 ? '★ ' : ''}${f.name || f.id}`, style: { marginTop: '6px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
    h('div', { text: sub, style: { color: C.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } })
  )
  card.addEventListener('click', (e) => {
    e.preventDefault()
    openFav(f)
  })
  return card
}

// kuenstler bild fehlt beim favorisieren oft, aus der (gecachten) kuenstlerseite nachholen
const triedImages = new Set()
async function fillArtistImages(list, node) {
  let fetched = 0
  for (const f of list) {
    if (f.type !== 'artist' || f.thumbnail || !f.id || triedImages.has(f.id)) continue
    triedImages.add(f.id)
    let page = await catalog.artist(f.id, { cacheOnly: true }).catch(() => null)
    if (!page?.thumbnail && fetched < 8) {
      fetched++
      page = await catalog.artist(f.id).catch(() => null)
    }
    if (!page?.thumbnail) continue
    f.thumbnail = page.thumbnail
    await music.db().put('favorites', { ...f }).catch(() => {})
    node.__dirty = true
  }
}

async function drawLibrary(node, ctx) {
  if (node.__at && Date.now() - node.__at < 30 * 1000) return
  node.__at = Date.now()
  const all = (await music.favorites.all().catch(() => [])).sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1) || (b.addedAt || 0) - (a.addedAt || 0))
  const type = ctx.state.get('m.fav.libType', 'all')
  const list = all.filter((f) => type === 'all' || f.type === type)
  const title = h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', margin: '8px 0 12px' } }, h('div', { text: 'Deine Favoriten (ytx)', style: { font: '700 24px/1.3 Roboto, Arial, sans-serif', color: C.primary, marginRight: '8px' } }))
  const songs = all.filter((f) => f.type === 'song')
  if (songs.length) title.append(pill({ label: songs.length === 1 ? '▶ Lieblingssong abspielen' : `▶ ${songs.length} Lieblingssongs abspielen`, onClick: () => ytxQueue.play(songs.map((f) => ({ videoId: f.id, title: f.name, artists: f.artists || [], thumbnail: f.thumbnail || '' })), { title: 'Lieblingssongs' }) }))
  title.append(pill({ label: 'Verwalten', title: 'Gewichte ändern und Favoriten entfernen im ytx-Panel', onClick: () => {
    const panel = pageWindow.__ytx?.panel
    panel?.open()
    panel?.select('music')
  } }))
  const chips = h('div', { class: 'ytx-m-chips' }, ...LIB_TYPES.map(([id, label]) => {
    const n = id === 'all' ? all.length : all.filter((f) => f.type === id).length
    const c = h('button', { type: 'button', class: 'ytx-m-chip', 'aria-pressed': String(type === id), text: `${label} ${n}` })
    c.addEventListener('click', (e) => {
      e.preventDefault()
      ctx.state.set('m.fav.libType', id)
      node.__at = 0
      drawLibrary(node, ctx)
    })
    return c
  }))
  if (!all.length) {
    node.replaceChildren(title, h('div', { text: 'Noch keine Favoriten. ★ in der Playerleiste oder auf Künstler-, Album- und Playlist-Seiten antippen, dann stehen sie hier.', style: { color: C.secondary, font: '400 14px Roboto, Arial, sans-serif' } }))
    return
  }
  const row = h('div', { style: { display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '6px' } }, ...list.map(favCard))
  node.replaceChildren(title, chips, list.length ? row : h('div', { text: 'Keine Favoriten dieser Art.', style: { color: C.secondary, font: '400 14px Roboto, Arial, sans-serif' } }))
  if (list.some((f) => f.type === 'artist' && !f.thumbnail && !triedImages.has(f.id))) {
    await fillArtistImages(list, node)
    if (node.__dirty) {
      node.__dirty = false
      node.__at = 0
      drawLibrary(node, ctx)
    }
  }
}

export const favoritesFeature = {
  id: 'm.favorites',
  site: 'music',
  label: 'Favoriten (★)',
  group: 'Hören',
  description: 'Stern in der Playerleiste und auf Künstler-, Album- und Playlist-Seiten. Favoriten zählen stärker als Likes und steuern „Für dich“ und Neuerscheinungen',
  stability: 'mittel-hoch',
  anchors: ['m.bar.middleButtons', 'm.header.buttons'],
  hotkeys: [['music.favorite', 'Aktuellen Song favorisieren', 'Alt+F']],
  settings: {
    barButton: { type: 'toggle', label: 'Stern in der Playerleiste', default: true },
    pageButton: { type: 'toggle', label: 'Stern auf Künstler/Album/Playlist-Seiten', default: true },
    libraryShelf: { type: 'toggle', label: 'Regal „Deine Favoriten (ytx)“ in der Mediathek', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    const state = { bar: null, page: null }

    const refreshBar = async (node) => {
      const t = currentTrack()
      if (!t) return
      const keys = [`song:${t.videoId}`, ...(t.artists || []).filter((a) => a.id).map((a) => `artist:${a.id}`)]
      const cacheKey = keys.join('|')
      if (node.__key === cacheKey && Date.now() - (node.__at || 0) < 4000) return
      node.__key = cacheKey
      node.__at = Date.now()
      const on = await music.favorites.has('song', t.videoId)
      node.setAttribute('aria-pressed', String(on))
      node.title = on ? 'Song ist Favorit – klicken für Optionen' : 'Favorisieren'
    }

    const barMenu = async (btn) => {
      const t = currentTrack()
      if (!t) return toast('Kein Titel erkannt')
      const items = [{ title: t.title }]
      const songOn = await music.favorites.has('song', t.videoId)
      items.push({ label: songOn ? 'Song nicht mehr favorisieren' : 'Song favorisieren', checked: songOn, run: () => toggle({ type: 'song', id: t.videoId, name: t.title, artists: t.artists, thumbnail: t.thumbnail }) })
      for (const a of (t.artists || []).filter((x) => x.id)) {
        const on = await music.favorites.has('artist', a.id)
        items.push({ label: on ? `${a.name} nicht mehr favorisieren` : `${a.name} favorisieren`, checked: on, run: () => toggle({ type: 'artist', id: a.id, name: a.name }) })
      }
      if (t.album?.id) {
        const on = await music.favorites.has('album', t.album.id)
        items.push({ label: on ? 'Album nicht mehr favorisieren' : `Album „${t.album.name}“ favorisieren`, checked: on, run: () => toggle({ type: 'album', id: t.album.id, name: t.album.name, artists: t.artists }) })
      }
      items.push({ sep: true }, { label: 'Mehr davon', run: () => act('more', t) }, { label: 'Weniger davon', run: () => act('less', t) }, { label: 'Song ignorieren', run: () => act('ignoreSong', t) })
      if (t.artists?.[0]) items.push({ label: `${t.artists[0].name} blockieren`, run: () => act('blockArtist', t) })
      showMenu(btn, items)
    }

    const act = async (kind, t) => toast(await music.act(kind, t))

    const toggle = async (item) => {
      const on = await music.favorites.toggle(item)
      toast(`${TYPE_LABEL[item.type]} ${on ? 'favorisiert' : 'entfernt'}: ${item.name}`)
      if (state.bar?.node) state.bar.node.__at = 0
      state.bar?.refresh()
      state.page?.refresh()
    }

    state.bar = ctx.mount({
      id: 'm.fav.bar',
      anchor: 'm.bar.middleButtons',
      position: 'prepend',
      when: () => s.barButton,
      create: () => iconButton({ icon: '★', title: 'Favorisieren', pressed: false, onClick: (e, b) => barMenu(b) }),
      update: (node) => refreshBar(node)
    })

    state.page = ctx.mount({
      id: 'm.fav.page',
      anchor: 'm.header.buttons',
      position: 'append',
      when: () => s.pageButton && ['artist', 'album', 'playlist'].includes(ctx.nav.page),
      create: () => {
        const b = iconButton({
          icon: '★',
          label: 'Favorit',
          pressed: false,
          onClick: async () => {
            const subj = pageSubject()
            if (!subj) return toast('Seite noch nicht erkannt')
            await toggle(subj)
          }
        })
        b.style.marginLeft = '8px'
        return b
      },
      update: async (node) => {
        const subj = pageSubject()
        if (!subj) return
        const key = `${subj.type}:${subj.id}`
        if (node.__key === key && Date.now() - (node.__at || 0) < 4000) return
        node.__key = key
        node.__at = Date.now()
        const on = await music.favorites.has(subj.type, subj.id)
        node.setAttribute('aria-pressed', String(on))
        node.querySelector('.ytx-m-lbl').textContent = on ? `${TYPE_LABEL[subj.type]}-Favorit` : 'Favorit'
      }
    })

    state.lib = ctx.mount({
      id: 'm.fav.library',
      anchor: 'm.browse.top',
      position: 'prepend',
      when: () => s.libraryShelf && ctx.nav.page === 'library',
      create: () => h('div', { class: 'ytx-m-shelf', style: { margin: '8px 0 28px' } }),
      update: (node) => drawLibrary(node, ctx)
    })

    const off = music.on('favorites', () => {
      if (state.lib.node) state.lib.node.__at = 0
      state.lib.refresh()
      if (state.bar.node) state.bar.node.__at = 0
      if (state.page.node) state.page.node.__at = 0
      state.bar.refresh()
      state.page.refresh()
    })

    ctx.action('music.favorite', async () => {
      const t = currentTrack()
      if (t) await toggle({ type: 'song', id: t.videoId, name: t.title, artists: t.artists, thumbnail: t.thumbnail })
    })

    return {
      update(next) {
        s = next
        state.bar.refresh()
        state.page.refresh()
        state.lib.refresh()
      },
      onVideo() {
        state.bar.refresh()
      },
      onPage() {
        state.page.refresh()
        state.lib.refresh()
      },
      dispose() {
        off()
        state.bar.destroy()
        state.page.destroy()
        state.lib.destroy()
      },
      health() {
        if (s.barButton && !state.bar.ok) return { status: currentTrack() ? 'warn' : 'skip', detail: currentTrack() ? 'Playerleiste nicht gefunden' : 'Kein Titel aktiv' }
        return { status: 'ok', detail: `Stern ${state.bar.ok ? 'in der Playerleiste' : ''}${state.page.ok ? ' und auf der Seite' : ''}` }
      }
    }
  }
}

