import { h } from '../../core/dom.js'
import { formatDuration } from '../../core/format.js'
import { currentTrack, currentBrowse, navigateEndpoint, endpoints } from '../../registry/music/player.js'
import { parseArtistPage } from '../../registry/music/parse.js'
import { music } from './runtime.js'
import { buildMix, checkReleases, releaseCheckRunning } from './engine.js'
import { MIXES } from './mixes.js'
import { catalog } from './data/catalog.js'
import { SESSION_PRESETS } from './logic/sessions.js'
import { GENRE_GROUPS, ALL_GENRES } from './logic/genres.js'
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
    forYouShelf: { type: 'toggle', label: 'Regal „Für dich (ytx)“ mit Neu mischen auf der Startseite', default: true },
    homeChips: { type: 'toggle', label: 'Eigene Chips über dem Regal (Für dich, Noch nie gehört, Lieblingsgenres …)', default: true },
    hideYouTubeChips: { type: 'toggle', label: 'YouTubes Stimmungs-Chips (Entspannung, Party …) dafür ausblenden', default: true },
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
      for (const node of [btn.node, fab]) {
        if (!node) continue
        if (badge) node.setAttribute('data-badge', String(badge))
        else node.removeAttribute('data-badge')
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

    // auf dem handy ist oben kein platz, dort schwebt der mix button unten rechts
    const fab = h('button', { type: 'button', class: 'ytx-m-fab', title: 'ytx Mix', 'data-ytx-own': '', text: 'Mix' })
    fab.addEventListener('click', (e) => {
      e.stopPropagation()
      toggle()
    })
    document.body.append(fab)
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
        const pick = h(
          'select',
          { title: 'Genre wählen' },
          h('option', { value: '', text: 'Genre wählen …', selected: !ALL_GENRES.includes(ui.genre) }),
          ...GENRE_GROUPS.map(([group, list]) => h('optgroup', { label: group }, ...list.map((g) => h('option', { value: g, text: g, selected: g === ui.genre }))))
        )
        pick.addEventListener('change', () => {
          if (!pick.value) return
          ui.genre = pick.value
          ctx.state.set('m.hub.genre', ui.genre)
          load(true)
        })
        const input = h('input', { type: 'search', placeholder: 'oder frei eingeben', value: ALL_GENRES.includes(ui.genre) ? '' : ui.genre, list: 'ytx-genres' })
        const dl = h('datalist', { id: 'ytx-genres' })
        catalog.moods().then((m) => dl.replaceChildren(...[...new Set([...ALL_GENRES, ...m.genres.map((g) => g.name), ...m.moods.map((g) => g.name)])].map((g) => h('option', { value: g })))).catch(() => {})
        input.addEventListener('change', () => {
          if (!input.value.trim()) return
          ui.genre = input.value.trim()
          ctx.state.set('m.hub.genre', ui.genre)
          load(true)
        })
        t.append(pick, input, dl)
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
      t.append(infoLine(prefs, session, disc))
    }

    // eine zeile was dieser mix gerade beruecksichtigt
    function infoLine(prefs, session, disc) {
      const favs = prefs.genres.favorites
      const a = currentArtist()
      const what = {
        forYou: `Deine ★-Künstler, meistgehörten Künstler, ähnliche Künstler und Lieblingssongs${prefs.genres.inForYou && favs.length ? `, dazu zwei deiner Lieblingsgenres (${favs.join(', ')})` : ''}`,
        releases: 'Neue Alben und Singles deiner ★-Künstler und meistgehörten Künstler',
        genre: ui.genre ? `Nur das Genre „${ui.genre}“, deine bekannten Künstler daraus zuerst` : 'Nur das gewählte Genre',
        longAgo: 'Deine Songs, die du früher gern gehört hast und seit über 45 Tagen nicht mehr',
        neverHeard: 'Wie „Für dich“, aber nur Songs und Künstler, die du noch nie gehört hast',
        similar: a ? `Künstler ähnlich wie ${a.name}` : 'Künstler ähnlich wie der aktuelle Künstler',
        moreFrom: a ? `Hits und Alben von ${a.name}` : 'Hits und Alben des aktuellen Künstlers',
        radio: 'Startpunkt aus dem Auswahlfeld, eigene Songs davon plus ähnliche Künstler'
      }[ui.tab]
      const parts = [what, `Regler ${Math.round(disc * 100)} von 100`]
      if (session) parts.push(`Session ${SESSION_PRESETS.find((p) => p.id === session.presetId)?.label || session.presetId}: filtert ${(SESSION_PRESETS.find((p) => p.id === session.presetId)?.extraTerms || []).join(', ') || 'nichts extra'}`)
      const box = h('div', { class: 'info', style: { flexBasis: '100%', fontSize: '12px', opacity: '.75', lineHeight: '1.4' } }, `Berücksichtigt: ${parts.join(' · ')}`)
      if (ui.tab === 'forYou' && favs.length) {
        const cb = h('input', { type: 'checkbox', checked: prefs.genres.inForYou, style: { verticalAlign: 'middle', margin: '0 4px 0 10px' } })
        cb.addEventListener('change', () => {
          music.updatePrefs((p) => (p.genres.inForYou = cb.checked))
          load(true, true)
        })
        box.append(h('label', { style: { whiteSpace: 'nowrap', cursor: 'pointer' } }, cb, 'Lieblingsgenres einbeziehen'))
      }
      return box
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
      // jeder aufruf macht laufende mixe ungueltig, sonst ueberschreibt ein langsamer alter mix den neuen tab
      const token = ++renderToken
      const tab = ui.tab
      if (tab === 'queue') return render()
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
      ui.loading = true
      ui.result = null
      drawBody('lädt …')
      const res = await buildMix(ui.tab === 'radio' ? 'radio' : ui.tab, args, { maxRequests: s.maxRequests, onProgress: (n, max) => token === renderToken && drawBody(`lädt Seiten … ${n}/${max}`) })
      if (token !== renderToken) return
      ui.loading = false
      ui.result = { ...res, tab }
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
      if (!r || (r.tab && r.tab !== ui.tab)) return
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
      if (ui.tab === 'queue') {
        ++renderToken
        return drawQueue()
      }
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

    const T = { primary: 'var(--ytmusic-text-primary, #fff)', secondary: 'var(--ytmusic-text-secondary, #aaa)' }
    const shelfTitle = (text, ...buttons) =>
      h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', margin: '8px 0 16px' } }, h('div', { text, style: { font: '700 24px/1.3 Roboto, Arial, sans-serif', color: T.primary, marginRight: '8px' } }), ...buttons)
    const shelfRow = () => h('div', { style: { display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '6px' } })
    const shelfCard = ({ img, title, sub, highlight, onClick }) => {
      const card = h(
        'div',
        { style: { flex: 'none', width: '150px', cursor: 'pointer', color: T.primary, font: '400 13px/1.35 Roboto, Arial, sans-serif' } },
        img ? h('img', { src: img, loading: 'lazy', alt: '', style: { width: '150px', height: '150px', borderRadius: '4px', objectFit: 'cover', background: 'rgba(255,255,255,.08)' } }) : h('div', { style: { width: '150px', height: '150px', borderRadius: '4px', background: 'rgba(255,255,255,.08)' } }),
        h('div', { text: title, style: { marginTop: '6px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: highlight ? '#ffc83d' : 'inherit' } }),
        h('div', { text: sub, title: sub, style: { color: T.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } })
      )
      card.addEventListener('click', (e) => {
        e.preventDefault()
        onClick()
      })
      return card
    }

    // ---------- fuer dich (ytx) mit neu mischen ----------

    const SHOWN = 'm.hub.shown'
    const home = { pool: null, poolAt: 0, step: 0, picked: [], loading: false, note: '', mode: ctx.state.get('m.hub.homeMode', 'forYou') }

    // chips ueber dem regal, jeder chip ist ein eigener mix
    const HOME_MODES = [
      ['forYou', 'Für dich'],
      ['neverHeard', 'Noch nie gehört'],
      ['longAgo', 'Lange nicht gehört'],
      ['releases', 'Neu von deinen Künstlern']
    ]
    const homeModes = () => [...HOME_MODES, ...music.prefs().genres.favorites.map((g) => [`genre:${g}`, g])]
    const modeLabel = (id) => homeModes().find(([m]) => m === id)?.[1] || 'Für dich'

    // gewichteter zufall, vorne liegende passen besser, schon gezeigte kommen zuletzt dran
    function pickFresh(items, n) {
      const shown = new Set(ctx.state.get(SHOWN, []))
      let pool = items.filter((i) => !shown.has(i.videoId))
      if (pool.length < n) {
        shown.clear()
        pool = items.slice()
      }
      const w = pool.map((_, i) => 1 / (i + 4))
      const out = []
      while (out.length < n && pool.length) {
        let r = Math.random() * w.reduce((a, b) => a + b, 0)
        let k = 0
        while (k < w.length - 1 && (r -= w[k]) > 0) k++
        out.push(pool.splice(k, 1)[0])
        w.splice(k, 1)
      }
      ctx.state.set(SHOWN, [...shown, ...out.map((x) => x.videoId)].slice(-400))
      return out
    }

    async function loadPool() {
      const base = music.effective().discovery
      const discovery = Math.min(1, base + [0, 0.25, 0.5][home.step % 3])
      const mode = homeModes().some(([m]) => m === home.mode) ? home.mode : 'forYou'
      home.note = ''
      let res
      if (mode.startsWith('genre:')) res = await buildMix('genre', { genre: mode.slice(6), discovery }, { maxRequests: 8, limit: 60 })
      else res = await buildMix(mode, { discovery }, { maxRequests: 8, limit: 80 })
      if (res.error) home.note = res.error
      home.poolMode = home.mode
      if (!res.items?.length && mode === 'forYou') {
        const favs = music.prefs().genres.favorites
        if (favs.length) {
          const genre = favs[Math.floor(Math.random() * favs.length)]
          res = await buildMix('genre', { genre, discovery }, { maxRequests: 6, limit: 60 })
          home.note = `Aus deinem Lieblingsgenre ${genre}`
        }
      }
      home.pool = res.items || []
      home.poolAt = Date.now()
    }

    async function shuffle(target, rebuild = false) {
      if (home.loading) return
      home.loading = true
      drawForYou(target, true)
      try {
        const shownCount = ctx.state.get(SHOWN, []).length
        // anderer chip, oft gemischt oder mehr neues gewuenscht: neuen pool holen
        if (rebuild || !home.pool || home.poolMode !== home.mode || Date.now() - home.poolAt > 30 * 60 * 1000 || (home.pool.length && shownCount >= home.pool.length * 0.6)) {
          if (rebuild) home.step++
          await loadPool()
        }
        home.picked = pickFresh(home.pool, 12)
      } catch (e) {
        home.note = `Fehler: ${e.message}`
      } finally {
        home.loading = false
        drawForYou(target, true)
      }
    }

    function switchYouTube() {
      const chips = [...document.querySelectorAll('ytmusic-browse-response:not([hidden]) ytmusic-section-list-renderer > #header ytmusic-chip-cloud-chip-renderer')].filter((c) => c.getAttribute('data-ytx-mchip') !== 'podcasts')
      if (!chips.length) {
        navigateEndpoint(endpoints.browse('FEmusic_home'))
        toast('YouTube-Startseite neu geladen')
        return
      }
      const turn = ctx.state.get('m.hub.chipTurn', 0)
      const chip = chips[turn % chips.length]
      ctx.state.set('m.hub.chipTurn', turn + 1)
      const target = chip.querySelector('a, button') || chip
      target.click()
      toast(`YouTube-Vorschläge darunter: ${chip.textContent.trim()}`)
    }

    function chipBar(target) {
      const bar = h('div', { class: 'ytx-m-chips' })
      for (const [id, label] of homeModes()) {
        const c = h('button', { type: 'button', class: 'ytx-m-chip', 'aria-pressed': String(home.mode === id), text: label, title: home.mode === id ? 'Nochmal klicken mischt neu' : '' })
        c.addEventListener('click', (e) => {
          e.preventDefault()
          home.mode = id
          ctx.state.set('m.hub.homeMode', id)
          shuffle(target)
        })
        bar.append(c)
      }
      const add = h('button', { type: 'button', class: 'ytx-m-chip ghost', title: 'Im Mix-Fenster ein Genre wählen und mit ☆ merken, dann erscheint es hier', text: '+ Genre' })
      add.addEventListener('click', (e) => {
        e.preventDefault()
        ui.tab = 'genre'
        ctx.state.set('m.hub.tab', 'genre')
        ui.result = null
        drawer.open()
        render()
      })
      bar.append(add)
      return bar
    }

    function drawForYou(target, force = false) {
      if (!target) return
      if (!s.forYouShelf) {
        target.replaceChildren()
        return
      }
      if (!force && target.__drawn) return
      target.__drawn = true
      if (!home.picked.length && !home.loading && !home.pool) {
        shuffle(target)
        return
      }
      const mix = pill({ label: home.loading ? 'mischt …' : '↻ Neu mischen', title: 'Andere Vorschläge aus diesem Mix', onClick: () => shuffle(target) })
      const more = pill({ label: 'Mehr Neues', title: 'Neuen Pool holen, stärker in Richtung Entdecken', onClick: () => shuffle(target, true) })
      const yt = pill({ label: 'YouTube-Vorschläge wechseln', title: 'Wechselt durch YouTubes eigene Stimmungen, damit die Regale darunter anders werden', onClick: switchYouTube })
      const play = pill({ label: '▶ Alle abspielen', onClick: () => home.picked.length && ytxQueue.play(home.picked, { title: modeLabel(home.mode) }) })
      const row = shelfRow()
      for (const it of home.picked) {
        row.append(shelfCard({ img: it.thumbnail, title: it.title, sub: `${it.artists.map((a) => a.name).join(', ')}${it.reasons?.[0] ? ` · ${it.reasons[0]}` : ''}`, onClick: () => navigateEndpoint(endpoints.radio(it.videoId)) }))
      }
      const children = [s.homeChips ? chipBar(target) : null, shelfTitle(`${modeLabel(home.mode)} (ytx)`, mix, more, yt, play)].filter(Boolean)
      if (home.note) children.push(h('div', { text: home.note, style: { color: T.secondary, font: '400 13px Roboto, Arial, sans-serif', margin: '-8px 0 12px' } }))
      if (home.picked.length) children.push(row)
      else if (!home.loading && home.mode !== 'forYou') children.push(h('div', { text: 'Für diesen Mix gibt es gerade keine Titel. Probier einen anderen Chip.', style: { color: T.secondary, font: '400 14px Roboto, Arial, sans-serif', marginBottom: '16px' } }))
      else if (!home.loading) children.push(h('div', { text: 'Noch zu wenig Daten. Favorisiere ein paar Künstler (★ in der Playerleiste), merke dir Genres im Mix-Fenster oder hör ein paar Songs, dann erscheinen hier Vorschläge.', style: { color: T.secondary, font: '400 14px Roboto, Arial, sans-serif', marginBottom: '16px' } }))
      target.replaceChildren(...children)
    }

    // ---------- neu von deinen kuenstlern ----------

    async function drawReleases(node) {
      if (!node) return
      if (!s.homeShelf) {
        node.replaceChildren()
        return
      }
      if (node.__at && Date.now() - node.__at < 60 * 1000) return
      node.__at = Date.now()
      const list = (await music.releases.latest(40).catch(() => [])).filter((r) => r.fresh || r.recent).slice(0, 12)
      if (!list.length) {
        node.replaceChildren()
        return
      }
      const row = shelfRow()
      for (const r of list) row.append(shelfCard({ img: r.thumbnail, title: `${r.fresh ? '● ' : ''}${r.title}`, sub: `${r.artistName}${r.kind ? ` · ${r.kind}` : ''}`, highlight: r.fresh, onClick: () => navigateEndpoint(endpoints.browse(r.id, null, 'ALBUM')) }))
      node.replaceChildren(shelfTitle('Neu von deinen Künstlern'), row)
    }

    const shelf = ctx.mount({
      id: 'm.hub.homeShelf',
      anchor: 'm.browse.top',
      position: 'prepend',
      when: () => (s.homeShelf || s.forYouShelf) && ctx.nav.page === 'home',
      create: () => {
        const forYou = h('div', { class: 'ytx-m-shelf-foryou' })
        const rel = h('div', { class: 'ytx-m-shelf-releases' })
        const node = h('div', { class: 'ytx-m-shelf', style: { margin: '0 0 24px' } }, forYou, rel)
        node.__forYou = forYou
        node.__rel = rel
        return node
      },
      update: (node) => {
        drawForYou(node.__forYou)
        drawReleases(node.__rel)
      }
    })

    const offs = [
      music.on('releases', () => {
        updateBadge()
        if (shelf.node?.__rel) shelf.node.__rel.__at = 0
        shelf.refresh()
        cache.clear()
      }),
      music.on('favorites', () => cache.clear()),
      music.on('prefs', () => {
        cache.clear()
        if (shelf.node?.__forYou && !home.loading) drawForYou(shelf.node.__forYou, true)
      }),
      music.on('session', () => drawer.isOpen && drawTools())
    ]
    updateBadge()

    // youtubes chips nur ausblenden wenn die eigenen wirklich da sind
    const chipsAttr = () => document.documentElement.toggleAttribute('data-ytx-mchips-off', !!(s.forYouShelf && s.homeChips && s.hideYouTubeChips))
    chipsAttr()

    return {
      drawer,
      open: () => {
        drawer.open()
        render()
      },
      update(next) {
        s = next
        chipsAttr()
        if (shelf.node?.__forYou) drawForYou(shelf.node.__forYou, true)
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
        fab.remove()
        document.documentElement.removeAttribute('data-ytx-mchips-off')
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
