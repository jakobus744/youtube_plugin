// youtube music renderer in einheitliche objekte
// klassifizierung ueber daten (pageType, musicVideoType, ids), nie ueber lokalisierte texte
// reine funktionen ohne dom, laufen gegen fixtures in tests

import { parseDuration, firstInt } from '../../core/format.js'

export const runsText = (t) => (t ? t.simpleText ?? (t.runs || []).map((r) => r.text).join('') : '')

export function pageTypeOf(ep) {
  const t = ep?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || ''
  return t.replace('MUSIC_PAGE_TYPE_', '')
}

export function videoTypeOf(ep) {
  return (ep?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '').replace('MUSIC_VIDEO_TYPE_', '')
}

const YEAR = /^(19|20)\d{2}$/

// laeufe mit links zu kuenstlern, album und jahr
export function parseByline(runs = []) {
  const artists = []
  let album = null
  let year = null
  let owner = null
  for (const r of runs) {
    const ep = r.navigationEndpoint
    const id = ep?.browseEndpoint?.browseId
    const pt = pageTypeOf(ep)
    const text = (r.text || '').trim()
    if (id && (pt === 'ARTIST' || (!pt && /^UC/.test(id)))) artists.push({ id, name: text })
    else if (id && pt === 'ALBUM') album = { id, name: text }
    else if (id && pt === 'USER_CHANNEL') owner = { id, name: text }
    else if (YEAR.test(text)) year = Number(text)
  }
  return { artists, album, year, owner }
}

// kuenstlernamen ohne link aus "A, B und C" wenn keine ids vorhanden sind
export function splitArtistNames(text) {
  return String(text || '')
    .split(/\s*(?:,|&| und | and | x | feat\.? | ft\.? )\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

const flexRuns = (r, i) => r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []
const fixedText = (r) => (r.fixedColumns || []).map((c) => runsText(c.musicResponsiveListItemFixedColumnRenderer?.text)).join(' ')

function thumbOf(r) {
  const list = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || r?.thumbnail?.thumbnails || []
  return list.length ? list[Math.min(list.length - 1, 1)].url : ''
}

// zeilen in listen: songs, videos, kuenstler, alben, playlists, podcasts
export function parseListItem(r) {
  if (!r) return null
  const title = runsText({ runs: flexRuns(r, 0) })
  const videoId = r.playlistItemData?.videoId || flexRuns(r, 0)[0]?.navigationEndpoint?.watchEndpoint?.videoId || null
  const playEp = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
  const vType = videoTypeOf(playEp) || videoTypeOf(flexRuns(r, 0)[0]?.navigationEndpoint)
  const allRuns = [...flexRuns(r, 1), ...flexRuns(r, 2), ...flexRuns(r, 3)]
  const by = parseByline(allRuns)
  const thumbnail = thumbOf(r)
  if (videoId) {
    if (vType === 'PODCAST_EPISODE') return { type: 'episode', videoId, title, thumbnail }
    const durationSec = parseDuration(fixedText(r)) ?? parseDuration(runsText({ runs: allRuns.filter((x) => /^\d+:\d{2}/.test(x.text || '')) }))
    if (!by.artists.length) {
      // albumseiten haben keine kuenstlerlinks pro zeile
      const plain = runsText({ runs: flexRuns(r, 1) })
      if (plain && !/\d/.test(plain)) by.artists.push(...splitArtistNames(plain).map((name) => ({ id: null, name })))
    }
    return {
      type: vType === 'OMV' || vType === 'UGC' ? 'video' : 'song',
      videoId,
      title,
      artists: by.artists,
      album: by.album,
      year: by.year,
      durationSec,
      videoType: vType || null,
      thumbnail,
      setVideoId: r.playlistItemData?.playlistSetVideoId || null
    }
  }
  const ep = r.navigationEndpoint
  const id = ep?.browseEndpoint?.browseId
  const pt = pageTypeOf(ep)
  if (!id) return null
  if (pt === 'ARTIST') return { type: 'artist', id, name: title, thumbnail }
  if (pt === 'ALBUM') return { type: 'album', id, title, artists: by.artists, year: by.year, thumbnail }
  if (pt === 'PLAYLIST') return { type: 'playlist', id: id.replace(/^VL/, ''), title, owner: by.owner, editorial: !by.owner, thumbnail }
  if (pt === 'PODCAST_SHOW_DETAIL_PAGE') return { type: 'podcast', id, title, thumbnail }
  if (pt === 'USER_CHANNEL') return { type: 'profile', id, name: title, thumbnail }
  return { type: 'other', id, title, pageType: pt }
}

// kacheln in karussells
export function parseTwoRow(r) {
  if (!r) return null
  const ep = r.navigationEndpoint
  const title = runsText(r.title)
  const subRuns = r.subtitle?.runs || []
  const by = parseByline(subRuns)
  const thumbnail = thumbOf(r)
  if (ep?.watchEndpoint?.videoId) {
    const vType = videoTypeOf(ep)
    return { type: vType === 'ATV' ? 'song' : 'video', videoId: ep.watchEndpoint.videoId, title, artists: by.artists, album: by.album, year: by.year, videoType: vType || null, thumbnail }
  }
  const id = ep?.browseEndpoint?.browseId
  const pt = pageTypeOf(ep)
  if (!id) return null
  if (pt === 'ARTIST') return { type: 'artist', id, name: title, subtitle: runsText(r.subtitle), thumbnail }
  if (pt === 'ALBUM') {
    const parts = runsText(r.subtitle).split('•').map((s) => s.trim()).filter(Boolean)
    const kind = parts.length > 1 && !YEAR.test(parts[0]) ? parts[0] : 'Album'
    return { type: 'album', id, title, kind, year: by.year ?? firstYear(parts), artists: by.artists, thumbnail }
  }
  if (pt === 'PLAYLIST') return { type: 'playlist', id: id.replace(/^VL/, ''), title, owner: by.owner, editorial: !by.owner && !subRuns.some((x) => x.navigationEndpoint), subtitle: runsText(r.subtitle), thumbnail }
  if (pt === 'PODCAST_SHOW_DETAIL_PAGE') return { type: 'podcast', id, title, thumbnail }
  return { type: 'other', id, title, pageType: pt }
}

const firstYear = (parts) => {
  const y = parts.find((p) => YEAR.test(p))
  return y ? Number(y) : null
}

export function parseItem(it) {
  if (!it) return null
  if (it.musicResponsiveListItemRenderer) return parseListItem(it.musicResponsiveListItemRenderer)
  if (it.musicTwoRowItemRenderer) return parseTwoRow(it.musicTwoRowItemRenderer)
  return null
}

function sectionsOf(data) {
  const c = data?.contents
  return (
    c?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
    c?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents ||
    c?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
    c?.sectionListRenderer?.contents ||
    []
  )
}

// regale einer seite, jedes mit geparsten eintraegen
export function parseShelves(data) {
  const out = []
  for (const s of sectionsOf(data)) {
    const key = Object.keys(s)[0]
    const v = s[key]
    const head = v?.header?.musicCarouselShelfBasicHeaderRenderer
    const items = (v?.contents || []).map(parseItem).filter(Boolean)
    out.push({
      kind: key,
      title: runsText(head?.title) || runsText(v?.title),
      more: head?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint?.browseId || null,
      items
    })
  }
  return out
}

// ---------- kuenstlerseite ----------

export function parseArtistPage(data, browseId = null) {
  const header = data?.header?.musicImmersiveHeaderRenderer || data?.header?.musicVisualHeaderRenderer || {}
  const shelves = parseShelves(data)
  const artist = { id: browseId, name: runsText(header.title), channelId: header.subscriptionButton?.subscribeButtonRenderer?.channelId || null, topSongs: [], releases: [], videos: [], featuredOn: [], ownPlaylists: [], similar: [] }
  for (const sh of shelves) {
    for (const it of sh.items) {
      if (it.type === 'song' && sh.kind === 'musicShelfRenderer') artist.topSongs.push(it)
      else if (it.type === 'album') artist.releases.push(it)
      else if (it.type === 'video' || (it.type === 'song' && sh.kind !== 'musicShelfRenderer')) artist.videos.push(it)
      else if (it.type === 'playlist') (it.editorial ? artist.featuredOn : artist.ownPlaylists).push(it)
      else if (it.type === 'artist') artist.similar.push(it)
    }
  }
  // top songs tragen den kuenstler selbst als link, daraus die id wenn unbekannt
  if (!artist.id) artist.id = artist.topSongs.flatMap((s) => s.artists).find((a) => a.name === artist.name)?.id || null
  for (const r of artist.releases) if (!r.artists.length && artist.id) r.artists = [{ id: artist.id, name: artist.name }]
  return artist
}

// ---------- album und playlist ----------

function responsiveHeader(data) {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []
  for (const t of tabs) if (t.musicResponsiveHeaderRenderer) return t.musicResponsiveHeaderRenderer
  return data?.header?.musicDetailHeaderRenderer || data?.header?.musicResponsiveHeaderRenderer || null
}

export function parseCollectionPage(data, params = {}) {
  const h = responsiveHeader(data) || {}
  const pageType = (params.browseEndpointContextSupportedConfigs ? JSON.parse(params.browseEndpointContextSupportedConfigs)?.browseEndpointContextMusicConfig?.pageType : '')?.replace('MUSIC_PAGE_TYPE_', '') || ''
  const straps = parseByline(h.straplineTextOne?.runs || [])
  const subParts = runsText(h.subtitle).split('•').map((s) => s.trim())
  const tracks = []
  const related = []
  for (const s of sectionsOf(data)) {
    const v = s.musicShelfRenderer || s.musicPlaylistShelfRenderer
    if (v) for (const it of v.contents || []) {
      const p = parseItem(it)
      if (p && (p.type === 'song' || p.type === 'video')) tracks.push(p)
    }
    if (s.musicCarouselShelfRenderer) related.push(...(s.musicCarouselShelfRenderer.contents || []).map(parseItem).filter(Boolean))
  }
  const artists = straps.artists
  const year = firstYear(subParts) ?? straps.year
  const isAlbum = pageType === 'ALBUM' || /^MPREb_/.test(params.browseId || '')
  if (isAlbum) for (const t of tracks) {
    // auf albumseiten sind alle eintraege songs, auch wenn youtube die videofassung verlinkt
    t.type = 'song'
    if (!t.artists.length || t.artists.every((a) => !a.id)) t.artists = artists.length ? artists : t.artists
    t.album ||= { id: params.browseId || null, name: runsText(h.title) }
    t.year ??= year
  }
  return {
    type: isAlbum ? 'album' : 'playlist',
    id: (params.browseId || '').replace(/^VL/, '') || null,
    title: runsText(h.title),
    kind: subParts.length > 1 ? subParts[0] : null,
    year,
    artists,
    trackCount: firstInt(runsText(h.secondSubtitle)),
    tracks,
    related
  }
}

// ---------- suche ----------

export function parseSearchPage(data) {
  const out = { songs: [], videos: [], artists: [], albums: [], playlists: [], podcasts: [], top: null }
  for (const s of sectionsOf(data)) {
    if (s.musicCardShelfRenderer) {
      const c = s.musicCardShelfRenderer
      const ep = c.title?.runs?.[0]?.navigationEndpoint
      out.top = { title: runsText(c.title), subtitle: runsText(c.subtitle), id: ep?.browseEndpoint?.browseId || ep?.watchEndpoint?.videoId || null, pageType: pageTypeOf(ep) }
      continue
    }
    const v = s.itemSectionRenderer || s.musicShelfRenderer
    for (const it of v?.contents || []) {
      const p = parseItem(it)
      if (!p) continue
      if (p.type === 'song') out.songs.push(p)
      else if (p.type === 'video') out.videos.push(p)
      else if (p.type === 'artist') out.artists.push(p)
      else if (p.type === 'album') out.albums.push(p)
      else if (p.type === 'playlist') out.playlists.push(p)
      else if (p.type === 'podcast' || p.type === 'episode') out.podcasts.push(p)
    }
  }
  return out
}

// ---------- stimmungen und genres ----------

export function parseMoodsPage(data) {
  const groups = []
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 20) return
    if (o.gridRenderer) {
      const g = o.gridRenderer
      groups.push({
        title: runsText(g.header?.gridHeaderRenderer?.title),
        items: (g.items || [])
          .map((i) => i.musicNavigationButtonRenderer)
          .filter(Boolean)
          .map((b) => ({ name: runsText(b.buttonText), params: b.clickCommand?.browseEndpoint?.params || null, browseId: b.clickCommand?.browseEndpoint?.browseId || null }))
      })
      return
    }
    for (const k of Object.keys(o)) walk(o[k], d + 1)
  }
  walk(data)
  // erste gruppe sind stimmungen, zweite genres, unabhaengig von der sprache
  return { moods: groups[0]?.items || [], genres: groups[1]?.items || [], groups }
}

// genre kategorie wie sie die app nach klick laedt
export function parseCategoryPage(data) {
  const shelves = parseShelves(data)
  const all = shelves.flatMap((s) => s.items)
  return {
    title: runsText(data?.header?.musicHeaderRenderer?.title),
    songs: all.filter((i) => i.type === 'song'),
    videos: all.filter((i) => i.type === 'video'),
    albums: all.filter((i) => i.type === 'album'),
    playlists: all.filter((i) => i.type === 'playlist'),
    artists: dedupeArtists(all.flatMap((i) => i.artists || []))
  }
}

export function dedupeArtists(list) {
  const seen = new Map()
  for (const a of list) {
    const key = a.id || `name:${a.name.toLowerCase()}`
    if (!seen.has(key)) seen.set(key, a)
  }
  return [...seen.values()]
}

// ---------- mediathek und verlauf mit login ----------

export function parseLibraryList(data) {
  const out = []
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 25) return
    if (o.musicResponsiveListItemRenderer) out.push(parseListItem(o.musicResponsiveListItemRenderer))
    else if (o.musicTwoRowItemRenderer) out.push(parseTwoRow(o.musicTwoRowItemRenderer))
    else for (const k of Object.keys(o)) walk(o[k], d + 1)
  }
  walk(data?.contents)
  return out.filter(Boolean)
}

// ---------- warteschlange aus dem app zustand ----------

export function parseQueueItem(item) {
  const r = item?.playlistPanelVideoRenderer || item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer
  if (!r) return null
  const counterpart = item?.playlistPanelVideoWrapperRenderer?.counterpart?.[0]?.counterpartRenderer?.playlistPanelVideoRenderer
  const by = parseByline(r.longBylineText?.runs || r.shortBylineText?.runs || [])
  if (!by.artists.length) {
    const first = runsText(r.shortBylineText || r.longBylineText).split('•')[0]
    by.artists.push(...splitArtistNames(first).map((name) => ({ id: null, name })))
  }
  return {
    type: 'song',
    videoId: r.videoId,
    counterpartVideoId: counterpart?.videoId || null,
    title: runsText(r.title),
    artists: by.artists,
    album: by.album,
    year: by.year,
    durationSec: parseDuration(runsText(r.lengthText)),
    selected: !!r.selected,
    setVideoId: r.playlistSetVideoId || null,
    thumbnail: (r.thumbnail?.thumbnails || [])[0]?.url || ''
  }
}
