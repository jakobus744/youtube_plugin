import { currentTrack, currentBrowse } from '../../registry/music/player.js'
import { parseArtistPage, parseCollectionPage } from '../../registry/music/parse.js'
import { music } from './runtime.js'
import { iconButton } from './ui.js'
import { showMenu, toast } from '../ui.js'

// favoriten fuer songs kuenstler alben und playlists mit eigenem gewicht

function pageSubject() {
  const b = currentBrowse()
  if (!b) return null
  const id = b.browseId
  if (/^UC[\w-]{22}$/.test(id)) {
    const a = parseArtistPage(b.response, id)
    return a.name ? { type: 'artist', id, name: a.name, thumbnail: '' } : null
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
    pageButton: { type: 'toggle', label: 'Stern auf Künstler/Album/Playlist-Seiten', default: true }
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

    const off = music.on('favorites', () => {
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
      },
      onVideo() {
        state.bar.refresh()
      },
      onPage() {
        state.page.refresh()
      },
      dispose() {
        off()
        state.bar.destroy()
        state.page.destroy()
      },
      health() {
        if (s.barButton && !state.bar.ok) return { status: currentTrack() ? 'warn' : 'skip', detail: currentTrack() ? 'Playerleiste nicht gefunden' : 'Kein Titel aktiv' }
        return { status: 'ok', detail: `Stern ${state.bar.ok ? 'in der Playerleiste' : ''}${state.page.ok ? ' und auf der Seite' : ''}` }
      }
    }
  }
}

