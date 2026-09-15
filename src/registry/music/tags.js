import { dataOf } from '../../core/bridge.js'
import { qsa } from '../../core/dom.js'
import { parseItem, pageTypeOf, videoTypeOf } from './parse.js'

// tagger regeln fuer music
// alles ueber browse ids, page types und icons statt sichtbarer texte

export const TAG_ATTRS = ['data-ytx-mguide', 'data-ytx-mguide-section', 'data-ytx-mshelf-kind', 'data-ytx-mitem', 'data-ytx-mchip', 'data-ytx-mtab', 'data-ytx-mpromo']

function guideName(d) {
  const id = d?.navigationEndpoint?.browseEndpoint?.browseId || ''
  const icon = String(d?.icon?.iconType || '')
  if (id === 'FEmusic_home') return 'home'
  if (id === 'FEmusic_explore') return 'explore'
  if (id === 'FEmusic_library_landing') return 'library'
  if (/immersive|samples/i.test(id) || /SAMPLES|SHORTS|IMMERSIVE/.test(icon)) return 'samples'
  if (/^SP|unlimited/i.test(id) || /UNLIMITED|PREMIUM|UPGRADE/.test(icon) || d?.navigationEndpoint?.urlEndpoint) return 'upgrade'
  return null
}

// podcast chip der startseite hat im params protobuf die kategorie 12 aktiv
export function chipKind(d) {
  const params = d?.navigationEndpoint?.browseEndpoint?.params
  if (params) {
    try {
      const bin = atob(params.replace(/-/g, '+').replace(/_/g, '/'))
      if (bin.includes('\x08\x0c\x10\x03')) return 'podcasts'
    } catch {}
  }
  return null
}

// ueberwiegender inhalt eines regals
export function shelfKind(d) {
  const items = d?.contents || []
  const counts = {}
  for (const it of items.slice(0, 12)) {
    const key = Object.keys(it || {})[0]
    if (key === 'musicMultiRowListItemRenderer') {
      counts.podcast = (counts.podcast || 0) + 1
      continue
    }
    const p = parseItem(it)
    if (!p) continue
    let k = p.type
    if (k === 'episode') k = 'podcast'
    counts[k] = (counts[k] || 0) + 1
  }
  const ep = d?.header?.musicCarouselShelfBasicHeaderRenderer?.moreContentButton?.buttonRenderer?.navigationEndpoint
  if (/immersive/i.test(ep?.browseEndpoint?.browseId || '')) return 'samples'
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

export const tagRules = [
  {
    id: 'm.guide',
    label: 'Seitenleisten-Einträge',
    core: true,
    run() {
      let n = 0
      for (const el of qsa('ytmusic-guide-entry-renderer, ytmusic-pivot-bar-item-renderer')) {
        const name = guideName(dataOf(el))
        if (name) {
          if (el.getAttribute('data-ytx-mguide') !== name) el.setAttribute('data-ytx-mguide', name)
          n++
        }
      }
      for (const sec of qsa('ytmusic-guide-section-renderer')) {
        const d = dataOf(sec)
        const entries = (d?.items || []).map((x) => Object.keys(x || {})[0])
        const kind = entries.some((k) => k === 'guideEntryRenderer') && (d?.items || []).some((x) => x.guideEntryRenderer?.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('VL')) ? 'playlists' : null
        if (kind) {
          sec.setAttribute('data-ytx-mguide-section', kind)
          n++
        }
      }
      return n
    }
  },
  {
    id: 'm.shelves',
    label: 'Regale nach Inhalt',
    run() {
      let n = 0
      for (const el of qsa('ytmusic-carousel-shelf-renderer, ytmusic-shelf-renderer')) {
        const d = dataOf(el)
        if (!d) continue
        if (el.__ytxShelfData === d) {
          n++
          continue
        }
        el.__ytxShelfData = d
        const kind = shelfKind(d)
        if (kind) el.setAttribute('data-ytx-mshelf-kind', kind)
        else el.removeAttribute('data-ytx-mshelf-kind')
        n++
      }
      return n
    }
  },
  {
    id: 'm.items',
    label: 'Listeneinträge nach Typ',
    pages: ['search', 'library', 'artist', 'other'],
    run() {
      let n = 0
      for (const el of qsa('ytmusic-responsive-list-item-renderer')) {
        const d = dataOf(el)
        if (!d || el.__ytxItemData === d) continue
        el.__ytxItemData = d
        const p = parseItem({ musicResponsiveListItemRenderer: d })
        if (p?.type) {
          el.setAttribute('data-ytx-mitem', p.type)
          n++
        }
      }
      return n
    }
  },
  {
    id: 'm.chips',
    label: 'Chips',
    pages: ['home'],
    run() {
      let n = 0
      for (const el of qsa('ytmusic-chip-cloud-chip-renderer')) {
        const k = chipKind(dataOf(el))
        if (k) {
          el.setAttribute('data-ytx-mchip', k)
          n++
        }
      }
      return n
    }
  },
  {
    id: 'm.playerTabs',
    label: 'Player-Tabs',
    run() {
      const tabs = qsa('ytmusic-player-page tp-yt-paper-tab')
      const page = document.querySelector('ytmusic-player-page')
      const st = page?.polymerController?.store?.getState?.() || document.querySelector('ytmusic-app')?.polymerController?.store?.getState?.()
      const data = st?.playerPage?.playerPageTabs || []
      let n = 0
      tabs.forEach((el, i) => {
        const t = data[i]?.tabRenderer
        const pt = t?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || ''
        const id = t?.endpoint?.browseEndpoint?.browseId || ''
        let name = null
        if (t?.content?.musicQueueRenderer) name = 'queue'
        else if (t?.content?.sectionListRenderer && !t.endpoint) name = 'comments'
        else if (id.startsWith('MPLYt') || /LYRICS/.test(pt)) name = 'lyrics'
        else if (/COMMENT/.test(pt) || /comment/i.test(id)) name = 'comments'
        else if (id.startsWith('MPTRt') || /TRACK_RELATED/.test(pt)) name = 'related'
        if (name) {
          el.setAttribute('data-ytx-mtab', name)
          n++
        }
      })
      return n
    }
  }
]

export { pageTypeOf, videoTypeOf }
