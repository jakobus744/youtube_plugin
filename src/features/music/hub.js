import { h } from '../../core/dom.js'
import { formatDuration } from '../../core/format.js'
import { currentTrack, currentBrowse, navigateEndpoint, endpoints } from '../../registry/music/player.js'
import { parseArtistPage } from '../../registry/music/parse.js'
import { music } from './runtime.js'
import { buildMix, checkReleases, releaseCheckRunning } from './engine.js'
import { MIXES } from './mixes.js'
import { catalog } from './data/catalog.js'
import { SESSION_PRESETS } from './logic/sessions.js'
import { ytxQueue } from './ytxQueue.js'
import { createDrawer, trackRow, pill } from './ui.js'
import { toast } from '../ui.js'

// mix fenster: fuer dich, neu, genre, lange nicht gehoert, noch nie gehoert, aehnlich, mehr von, smart radio

const SHORT = { forYou: 'Für dich', releases: 'Neu', genre: 'Genre', longAgo: 'Lange nicht gehört', neverHeard: 'Noch nie gehört', similar: 'Ähnlich', moreFrom: 'Mehr von', radio: 'Smart Radio' }
const TABS = [...MIXES.map(([id, label]) => [id, SHORT[id] || label, label]), ['queue', 'Reihenfolge', 'ytx-Reihenfolge']]
const cache = new Map()

function currentArtist() {
  const b = currentBrowse()
  if (b && /^UC[\w-]{22}$/.test(b.browseId)) {
    const a = parseArtistPage(b.response, b.browseId)
    if (a.name) return { id: b.browseId, name: a.name }
  }
  const t = currentTrack()
  const a = t?.artists?.find((x) => x.id)
  return a ? { id: a.id, name: a.name } : null
}

export const hubFeature = {
  id: 'm.hub',
  site: 'music',
  label: 'Mix-Fenster (Für dich, Neu, Genre, Smart Radio)',
  group: 'Entdecken',
  description: 'Eigene Empfehlungen aus deinem lokalen Profil und YouTube-Music-Seiten, jeweils mit Begründung und Feedback-Knöpfen. Button „Mix“ oben rechts',
  stability: 'mittel',
  anchors: ['top.buttons', 'm.browse.top'],
  hotkeys: [['music.hub', 'Mix-Fenster öffnen/schließen', 'Alt+M']],
  settings: {
    homeShelf: { type: 'toggle', label: 'Regal „Neu von deinen Künstlern“ auf der Startseite', default: true },
    maxRequests: { type: 'range', label: 'Max. neue Seitenabrufe pro Mix', min: 2, max: 40, step: 1, default: 12 },
    explain: { type: 'toggle', label: 'Begründungen anzeigen', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    const ui = { tab: ctx.state.get('m.hub.tab', 'forYou'), discovery: null, genre: ctx.state.get('m.hub.genre', ''), seed: null, result: null, loading: false }
    let badge = 0
    let renderToken = 0

    const drawer = createDrawer({ title: 'ytx Mix' })

    const updateBadge = async () => {
      badge = await music.releases.unseenCount().catch(() => 0)
      if (btn.node) {
        if (badge) btn.node.setAttribute('data-badge', String(badge))
        else btn.node.removeAttribute('data-badge')
      }
    }

    const btn = ctx.mount({
      id: 'm.hub.button',
      anchor: 'top.buttons',
      position: 'prepend',
      create: () => {
        const b = pill({ label: 'Mix', title: 'ytx Mix (Alt+M)', onClick: () => toggle() })
        b.style.margin = '0 8px'
        return b
      }
    })

    function toggle() {
      drawer.toggle()
      if (drawer.isOpen) render()
    }
    ctx.action('music.hub', toggle)

    // ---------- kopf ----------

    function drawTabs() {
      drawer.tabs.replaceChildren(
        ...TABS.map(([id, label]) => {
          const b = h('button', { class: 'tab', type: 'button', 'aria-selected': String(ui.tab === id), text: id === 'releases' && badge ? `${label} (${badge})` : label })
          b.addEventListener('click', () => {
            ui.tab = id
            ctx.state.set('m.hub.tab', id)
            ui.result = null
            render()
          })
          return b
        })
      )
    }

    function drawTools() {
      const prefs = music.prefs()
      const session = music.session()
      const t = drawer.tools
      t.replaceChildren()
      if (ui.tab === 'queue') return
      const disc = ui.discovery ?? music.effective().discovery
      const slider = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(disc * 100) })
      const val = h('span', { text: `${Math.round(disc * 100)}` })
      slider.addEventListener('input', () => (val.textContent = slider.value))
      slider.addEventListener('change', () => {
        ui.discovery = Number(slider.value) / 100
        load(true)
      })
      t.append(h('label', { title: 'Nur für diese Ansicht, Standard im ytx-Panel' }, 'Bekannt', slider, 'Entdecken'))
      const sel = h('select', { title: 'Session-Preset, gilt nur in diesem Tab' }, h('option', { value: '', text: 'Keine Session', selected: !session }), ...SESSION_PRESETS.map((p) => h('option', { value: p.id, text: p.label, selected: session?.presetId === p.id })))
      sel.addEventListener('change', () => {
        music.setSession(sel.value || null)
        ui.discovery = null
        load(true)
      })
      t.append(sel)
      if (ui.tab === 'genre') {
        const input = h('input', { type: 'search', placeholder: 'Genre oder Stimmung', value: ui.genre, list: 'ytx-genres' })
        const dl = h('datalist', { id: 'ytx-genres' })
        catalog.moods().then((m) => dl.replaceChildren(...[...m.genres, ...m.moods].map((g) => h('option', { value: g.name })))).catch(() => {})
        input.addEventListener('change', () => {
          ui.genre = input.value.trim()
          ctx.state.set('m.hub.genre', ui.genre)
          load(true)
        })
        t.append(input, dl)
        const favs = prefs.genres.favorites
        if (ui.genre) {
          const on = favs.includes(ui.genre)
          const star = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(on), text: on ? '★ Lieblingsgenre' : '☆ merken' })
          star.addEventListener('click', () => {
            music.updatePrefs((p) => {
              const set = new Set(p.genres.favorites)
              if (set.has(ui.genre)) set.delete(ui.genre)
              else set.add(ui.genre)
              p.genres.favorites = [...set]
            })
            drawTools()
          })
          t.append(star)
        }
        for (const g of favs) {
          const c = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(g === ui.genre), text: g })
          c.addEventListener('click', () => {
            ui.genre = g
            ctx.state.set('m.hub.genre', g)
            load(true)
          })
          t.append(c)
        }
      }
      if (ui.tab === 'releases') {
        const run = h('button', { class: 'btn sec', type: 'button', text: releaseCheckRunning() ? 'prüft …' : 'Jetzt prüfen', disabled: releaseCheckRunning() })
        run.addEventListener('click', async () => {
          run.disabled = true
          run.textContent = 'prüft …'
          const r = await checkReleases({ force: true, onProgress: (n, total) => (run.textContent = `prüft ${n}/${total}`) }).catch((e) => ({ error: e.message }))
          toast(r.error ? `Prüfung fehlgeschlagen: ${r.error}` : `${r.checked} Künstler geprüft, ${r.fresh} neu`)
          load(true)
        })
        t.append(run)
      }
      if (ui.tab === 'radio') {
        const tr = currentTrack()
        const a = currentArtist()
        const opts = [
          tr && ['song', `Song: ${tr.title}`],
          a && ['artist', `Künstler: ${a.name}`],
          ui.genre && ['genre', `Genre: ${ui.genre}`],
          ...SESSION_PRESETS.map((p) => [`mood:${p.id}`, `Stimmung: ${p.label}`])
        ].filter(Boolean)
        const cur = ui.seed?.key || opts[0]?.[0] || ''
        const seedSel = h('select', null, ...opts.map(([v, l]) => h('option', { value: v, text: l, selected: v === cur })))
        seedSel.addEventListener('change', () => {
          ui.seed = { key: seedSel.value }
          load(true)
        })
        t.append(seedSel)
      }
      const reload = h('button', { class: 'btn sec', type: 'button', text: '↻' , title: 'Neu berechnen' })
      reload.addEventListener('click', () => load(true, true))
      t.append(reload)
    }

    // ---------- inhalt ----------

    function mixArgs() {
      const disc = ui.discovery
      const base = disc == null ? {} : { discovery: disc }
      if (ui.tab === 'genre') return { ...base, genre: ui.genre }
      if (ui.tab === 'similar' || ui.tab === 'moreFrom') return { ...base, artist: currentArtist() }
      if (ui.tab === 'radio') {
        const key = ui.seed?.key || (currentTrack() ? 'song' : currentArtist() ? 'artist' : 'mood:explore')
        const tr = currentTrack()
        if (key === 'song' && tr) return { ...base, seed: { type: 'song', ...tr } }
        if (key === 'artist') return { ...base, seed: { type: 'artist', ...currentArtist() } }
        if (key === 'genre') return { ...base, seed: { type: 'genre', name: ui.genre } }
        if (key.startsWith('mood:')) return { ...base, seed: { type: 'mood', presetId: key.slice(5) } }
      }
      return base
    }

    function cacheKey(args) {
      return JSON.stringify([ui.tab, args.genre, args.artist?.id, args.seed?.videoId || args.seed?.id || args.seed?.name || args.seed?.presetId, args.discovery, music.session()?.presetId])
    }

    async function load(redraw = false, force = false) {
      if (redraw) drawTools()
      if (ui.tab === 'queue') return render()
      const args = mixArgs()
      const key = cacheKey(args)
      const hit = cache.get(key)
      if (!force && hit && Date.now() - hit.at < 10 * 60 * 1000) {
        ui.result = hit.result
        return drawBody()
      }
      if ((ui.tab === 'similar' || ui.tab === 'moreFrom') && !args.artist) {
        ui.result = { items: [], error: 'Öffne eine Künstlerseite oder spiele einen Song, dann weiß ytx, um wen es geht.' }
        return drawBody()
      }
      if (ui.tab === 'genre' && !args.genre) {
        ui.result = { items: [], error: 'Genre oder Stimmung oben eingeben, z. B. Deutschrap, Indie, Chill.' }
        return drawBody()
      }
      const token = ++renderToken
      ui.loading = true
      ui.result = null
      drawBody('lädt …')
      const res = await buildMix(ui.tab === 'radio' ? 'radio' : ui.tab, args, { maxRequests: s.maxRequests, onProgress: (n, max) => token === renderToken && drawBody(`lädt Seiten … ${n}/${max}`) })
      if (token !== renderToken) return
      ui.loading = false
      ui.result = res
      if (!res.error) cache.set(key, { at: Date.now(), result: res })
      drawBody()
      if (ui.tab === 'releases') {
        music.releases.markSeen()
        updateBadge()
      }
    }

    function menuFor(item, anchor) {
      const first = item.artists?.[0]
      const act = async (kind) => {
        toast(await music.act(kind, item))
        cache.clear()
      }
      drawer.menu(anchor, [
        ['▶ Abspielen mit Radio', () => navigateEndpoint(endpoints.radio(item.videoId))],
        ['Ab hier in ytx-Reihenfolge', () => playAll(ui.result.items.indexOf(item))],
        ['👍 Mehr davon', () => act('more')],
        ['👎 Weniger davon', () => act('less')],
        first && [`Künstler bevorzugen: ${first.name}`, () => act('preferArtist')],
        first && [`Künstler blockieren: ${first.name}`, () => act('blockArtist')],
        ['Song ignorieren', () => act('ignoreSong')],
        first?.id && [`★ ${first.name} favorisieren`, async () => toast((await music.favorites.toggle({ type: 'artist', id: first.id, name: first.name })) ? 'Favorisiert' : 'Entfernt')],
        first?.id && [`Ähnlich wie ${first.name}`, () => openArtistTab('similar', first)],
        first?.id && [`Mehr von ${first.name}`, () => openArtistTab('moreFrom', first)],
        ['Aus Profil ausschließen', () => act('excludeSong')]
      ].filter(Boolean))
    }

    let artistOverride = null
    function openArtistTab(tab, artist) {
      artistOverride = artist
      ui.tab = tab
      ui.result = null
      render()
    }

    function playAll(start = 0) {
      const items = ui.result?.items || []
      if (!items.length) return
      ytxQueue.play(items, { start: Math.max(0, start), title: TABS.find(([id]) => id === ui.tab)?.[1] || 'Mix' })
      toast(`ytx-Reihenfolge: ${items.length} Titel`)
    }

    function drawBody(status) {
      const main = drawer.main
      main.replaceChildren()
      if (status) return main.append(h('div', { class: 'status', text: status }))
      const r = ui.result
      if (!r) return
      if (r.error) return main.append(h('div', { class: 'status err', text: r.error }))
      if (ui.tab === 'releases' && r.releases?.length) {
        main.append(h('div', { class: 'section-title', text: 'Veröffentlichungen' }))
        const grid = h('div', { class: 'grid' })
        for (const rel of r.releases.slice(0, 24)) {
          const card = h('div', { class: 'card', title: `${rel.artistName} · ${rel.title}` }, rel.thumbnail ? h('img', { src: rel.thumbnail, loading: 'lazy', alt: '' }) : h('img', { alt: '' }), h('div', { class: ['title', rel.fresh && 'new'], text: `${rel.fresh ? '● ' : ''}${rel.title}` }), h('div', { class: 'sub', text: `${rel.artistName}${rel.year ? ` · ${rel.year}` : ''}${rel.kind ? ` · ${rel.kind}` : ''}` }))
          card.addEventListener('click', () => navigateEndpoint(endpoints.browse(rel.id, null, 'ALBUM')))
          grid.append(card)
        }
        main.append(grid)
      } else if (ui.tab === 'releases') {
        main.append(h('div', { class: 'status', text: 'Noch keine Veröffentlichungen bekannt. Favorisiere Künstler (★) oder höre ein paar Songs, dann „Jetzt prüfen“.' }))
      }
      const items = r.items || []
      const head = h('div', { class: 'status' }, `${items.length} Titel${items.length ? ` · ${formatDuration(items.reduce((a, x) => a + (x.durationSec || 0), 0))}` : ''} · ${r.requests || 0} Seitenabrufe · ${Math.round(r.ms || 0)} ms${r.errors?.length ? ` · ${r.errors.length} Fehler` : ''}`)
      if (items.length) {
        const all = h('button', { class: 'btn', type: 'button', text: '▶ Alles abspielen', style: { marginLeft: '8px' } })
        all.addEventListener('click', () => playAll(0))
        head.append(all)
      }
      main.append(head)
      if (!items.length && ui.tab !== 'releases') main.append(h('div', { class: 'status', text: emptyHint() }))
      for (const it of items) main.append(trackRow(it, { explain: s.explain && music.prefs().explain, onPlay: (x) => navigateEndpoint(endpoints.radio(x.videoId)), onMenu: menuFor }))
    }

    function emptyHint() {
      if (ui.tab === 'longAgo') return 'Noch nichts: hier landen Songs, die du früher gern gehört hast und seit über 45 Tagen nicht mehr.'
      if (ui.tab === 'forYou' || ui.tab === 'neverHeard') return 'Zu wenig Daten. Favorisiere ein paar Künstler (★ in der Playerleiste) oder höre ein paar Songs mit eingeschaltetem Hörverlauf.'
      return 'Keine passenden Titel gefunden. Blocklisten im ytx-Panel prüfen oder den Regler Richtung „Entdecken“ schieben.'
    }

    function drawQueue() {
      const main = drawer.main
      const st = ytxQueue.state
      main.replaceChildren()
      if (!st.items.length) return main.append(h('div', { class: 'status', text: 'Keine ytx-Reihenfolge aktiv. In einem Mix „▶ Alles abspielen“ wählen.' }))
      const ctl = h('div', { class: 'status' }, `${st.title || 'Mix'} · ${st.index + 1}/${st.items.length} · Rest ${formatDuration(ytxQueue.remaining())} · ${st.active ? 'aktiv' : st.note || 'pausiert'}`)
      const b = h('button', { class: 'btn sec', type: 'button', text: st.active ? 'Stop' : 'Fortsetzen', style: { marginLeft: '8px' } })
      b.addEventListener('click', () => (st.active ? ytxQueue.stop() : ytxQueue.resume()))
      const c = h('button', { class: 'btn sec', type: 'button', text: 'Leeren', style: { marginLeft: '6px' } })
      c.addEventListener('click', () => ytxQueue.clear())
      ctl.append(b, c)
      main.append(ctl)
      st.items.forEach((it, i) => {
        const row = trackRow(it, { explain: false, onPlay: () => ytxQueue.jumpTo(i), onMenu: menuFor })
        if (i === st.index) row.style.background = 'rgba(255,255,255,.1)'
        if (i < st.index) row.style.opacity = '.5'
        main.append(row)
      })
    }

    function render() {
      if (!drawer.isOpen) return
      drawTabs()
      drawTools()
      if (ui.tab === 'queue') return drawQueue()
      if (artistOverride && (ui.tab === 'similar' || ui.tab === 'moreFrom')) {
        const a = artistOverride
        artistOverride = null
        const args = { artist: a, ...(ui.discovery == null ? {} : { discovery: ui.discovery }) }
        const token = ++renderToken
        drawBody('lädt …')
        buildMix(ui.tab, args, { maxRequests: s.maxRequests }).then((res) => {
          if (token !== renderToken) return
          ui.result = res
          drawBody()
        })
        return
      }
      if (ui.result) drawBody()
      else load()
    }

    const offQueue = ytxQueue.on(() => drawer.isOpen && ui.tab === 'queue' && drawQueue())

    // ---------- startseite ----------

    const shelf = ctx.mount({
      id: 'm.hub.homeShelf',
      anchor: 'm.browse.top',
      position: 'prepend',
      when: () => s.homeShelf && ctx.nav.page === 'home',
      create: () => h('div', { class: 'ytx-m-shelf', style: { margin: '0 0 24px' } }),
      update: (node) => drawShelf(node)
    })

    async function drawShelf(node) {
      if (node.__at && Date.now() - node.__at < 60 * 1000) return
      node.__at = Date.now()
      const list = (await music.releases.latest(40).catch(() => [])).filter((r) => r.fresh || r.recent).slice(0, 12)
      if (!list.length) {
        node.replaceChildren()
        return
      }
      const row = h('div', { style: { display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '6px' } })
      for (const r of list) {
        const card = h(
          'a',
          { href: `/browse/${r.id}`, style: { flex: 'none', width: '150px', color: 'var(--ytmusic-text-primary, #fff)', textDecoration: 'none', font: '400 13px/1.35 Roboto, Arial, sans-serif' } },
          h('img', { src: r.thumbnail, loading: 'lazy', alt: '', style: { width: '150px', height: '150px', borderRadius: '4px', objectFit: 'cover', background: 'rgba(255,255,255,.08)' } }),
          h('div', { text: `${r.fresh ? '● ' : ''}${r.title}`, style: { marginTop: '6px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: r.fresh ? '#ffc83d' : 'inherit' } }),
          h('div', { text: `${r.artistName}${r.kind ? ` · ${r.kind}` : ''}`, style: { color: 'var(--ytmusic-text-secondary, #aaa)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } })
        )
        card.addEventListener('click', (e) => {
          e.preventDefault()
          navigateEndpoint(endpoints.browse(r.id, null, 'ALBUM'))
        })
        row.append(card)
      }
      node.replaceChildren(h('div', { style: { font: '700 24px/1.3 Roboto, Arial, sans-serif', color: 'var(--ytmusic-text-primary, #fff)', margin: '8px 0 16px' }, text: 'Neu von deinen Künstlern' }), row)
    }

    const offs = [
      music.on('releases', () => {
        updateBadge()
        if (shelf.node) shelf.node.__at = 0
        shelf.refresh()
        cache.clear()
      }),
      music.on('favorites', () => cache.clear()),
      music.on('prefs', () => cache.clear()),
      music.on('session', () => drawer.isOpen && drawTools())
    ]
    updateBadge()

    return {
      drawer,
      open: () => {
        drawer.open()
        render()
      },
      update(next) {
        s = next
        shelf.refresh()
        render()
      },
      onPage() {
        shelf.refresh()
      },
      dispose() {
        offQueue()
        for (const off of offs) off()
        btn.destroy()
        shelf.destroy()
        drawer.host.remove()
      },
      health() {
        if (!btn.ok) return { status: 'warn', detail: 'Kopfzeile für den Mix-Button nicht gefunden' }
        const r = ui.result
        return { status: r?.errors?.length ? 'warn' : 'ok', detail: `Button da${badge ? ` · ${badge} neue Veröffentlichungen` : ''}${r ? ` · letzter Mix ${r.items?.length || 0} Titel, ${r.requests} Abrufe${r.errors?.length ? `, Fehler: ${r.errors[0]}` : ''}` : ''}` }
      }
    }
  }
}
