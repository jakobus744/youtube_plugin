import { parseQueueItem, runsText } from './parse.js'

// laufzeitdaten von music an einer stelle
// reihenfolge der quellen: redux store der app, player api, dom

export const appEl = () => document.querySelector('ytmusic-app')

export function appStore() {
  try {
    const s = appEl()?.polymerController?.store
    return s && typeof s.getState === 'function' ? s : null
  } catch {
    return null
  }
}

export function appState() {
  try {
    return appStore()?.getState() || null
  } catch {
    return null
  }
}

export function playerApi() {
  const p = document.getElementById('movie_player')
  return p && typeof p.getVideoData === 'function' ? p : null
}

export function mediaEl() {
  return document.querySelector('#movie_player video') || document.querySelector('ytmusic-player video')
}

export function isLoggedIn() {
  try {
    const cfg = (window.wrappedJSObject || window).ytcfg?.get?.('LOGGED_IN')
    if (typeof cfg === 'boolean') return cfg
  } catch {}
  return !document.querySelector('ytmusic-nav-bar a.sign-in-link')
}

export function queueRaw() {
  return appState()?.queue || null
}

// alle eintraege der warteschlange geparst, index bleibt erhalten
export function queueItems() {
  const q = queueRaw()
  if (!q?.items) return []
  const out = []
  q.items.forEach((it, i) => {
    const p = parseQueueItem(it)
    if (p) out.push({ ...p, index: i })
  })
  const auto = []
  ;(q.automixItems || []).forEach((it, i) => {
    const p = parseQueueItem(it)
    if (p) auto.push({ ...p, index: q.items.length + i, automix: true })
  })
  return out.concat(auto)
}

export function selectedIndex() {
  const q = queueRaw()
  return typeof q?.selectedItemIndex === 'number' ? q.selectedItemIndex : -1
}

export function likeOf(videoId) {
  const st = appState()
  const v = st?.likeStatus?.videos?.[videoId]
  if (v) return v
  const bar = document.querySelector('ytmusic-player-bar ytmusic-like-button-renderer')
  return bar?.getAttribute('like-status') || 'INDIFFERENT'
}

export function isPlayerPageOpen() {
  return document.querySelector('ytmusic-app-layout')?.hasAttribute('player-page-open') || false
}

// aktueller titel mit allem was der tracker braucht
export function currentTrack() {
  const p = playerApi()
  const st = appState()
  const vd = st?.player?.playerResponse?.videoDetails
  let vid = null
  try { vid = p?.getVideoData?.()?.video_id || null } catch {}
  vid ||= vd?.videoId || null
  if (!vid) return null
  const items = queueItems()
  const item = items.find((x) => x.videoId === vid || x.counterpartVideoId === vid) || items.find((x) => x.index === selectedIndex()) || null
  const sameItem = item && (item.videoId === vid || item.counterpartVideoId === vid)
  let pos = 0
  let dur = 0
  let rate = 1
  let state = -1
  try {
    pos = p?.getCurrentTime?.() || 0
    dur = p?.getDuration?.() || 0
    rate = p?.getPlaybackRate?.() || 1
    state = p?.getPlayerState?.() ?? -1
  } catch {}
  if (!dur && vd?.lengthSeconds) dur = Number(vd.lengthSeconds) || 0
  const ad = !!(st?.player?.adPlaying || p?.classList?.contains('ad-showing'))
  const playing = typeof st?.player?.isPlaying === 'boolean' ? st.player.isPlaying : state === 1
  return {
    videoId: vid,
    title: (sameItem && item.title) || (vd?.videoId === vid ? vd.title : '') || '',
    artists: sameItem && item.artists?.length ? item.artists : vd?.videoId === vid && vd.author ? [{ id: vd.channelId || null, name: vd.author.replace(/ - Topic$/, '') }] : [],
    album: sameItem ? item.album : null,
    year: sameItem ? item.year : null,
    durationSec: dur || (sameItem ? item.durationSec : 0),
    thumbnail: sameItem ? item.thumbnail : '',
    videoType: vd?.videoId === vid ? vd.musicVideoType || null : null,
    counterpartVideoId: sameItem ? (item.videoId === vid ? item.counterpartVideoId : item.videoId) : null,
    liked: likeOf(vid) === 'LIKE',
    disliked: likeOf(vid) === 'DISLIKE',
    ad,
    playing,
    pos,
    dur,
    rate,
    audioOnly: !!st?.player?.audioOnly,
    queueIndex: sameItem ? item.index : -1
  }
}

// ---------- songtext ----------

export function lyricsBrowseId() {
  const tabs = appState()?.playerPage?.playerPageTabs || []
  for (const t of tabs) {
    const id = t?.tabRenderer?.endpoint?.browseEndpoint?.browseId
    if (id && id.startsWith('MPLYt')) return id
  }
  return null
}

export function lyricsTabIndex() {
  const tabs = appState()?.playerPage?.playerPageTabs || []
  return tabs.findIndex((t) => t?.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith('MPLYt'))
}

// liefert null wenn noch nicht geladen, { lines: [] } wenn keiner existiert
export function lyricsData() {
  const st = appState()
  const id = lyricsBrowseId()
  const tabs = st?.playerPage?.playerPageTabs || []
  const tabIdx = lyricsTabIndex()
  const unselectable = tabIdx >= 0 && tabs[tabIdx]?.tabRenderer?.unselectable
  if (!id) return tabs.length ? { available: false, reason: unselectable ? 'kein Songtext' : 'kein Songtext-Tab' } : null
  const content = st?.playerPage?.playerPageTabsContent?.[id]
  if (!content) return null
  const sections = content?.contents?.sectionListRenderer?.contents || []
  for (const s of sections) {
    const timed = s.musicTimedLyricsRenderer || s.timedLyricsRenderer
    if (timed?.timedLyricsData) {
      return {
        available: true,
        timed: true,
        lines: timed.timedLyricsData.map((l) => ({ text: l.lyricLine || '', startMs: Number(l.cueRange?.startTimeMilliseconds) || 0 })),
        source: runsText(timed.footer || timed.sourceMessage)
      }
    }
    const d = s.musicDescriptionShelfRenderer
    if (d?.description) {
      const text = runsText(d.description)
      return { available: true, timed: false, lines: text.split('\n').map((t) => ({ text: t })), source: runsText(d.footer) }
    }
  }
  const msg = sections.map((s) => runsText(s.messageRenderer?.text || s.musicMessageRenderer?.text)).find(Boolean)
  return { available: false, reason: msg || 'kein Songtext' }
}

// ---------- navigation ----------

// ein polymer link mit endpoint wird von der app selbst navigiert
// so laeuft wiedergabe und seitenwechsel ohne neu laden und ohne eigene api aufrufe
export function navigateEndpoint(endpoint) {
  const app = appEl()
  if (!app || !endpoint) return false
  const ys = document.createElement('yt-formatted-string')
  ys.setAttribute('data-ytx-own', '')
  ys.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden'
  app.append(ys)
  ys.text = { runs: [{ text: 'ytx', navigationEndpoint: endpoint }] }
  return new Promise((resolve) => {
    let tries = 0
    const go = () => {
      const a = ys.querySelector('a')
      if (a) {
        a.click()
        ys.remove()
        resolve(true)
      } else if (++tries > 20) {
        ys.remove()
        resolve(false)
      } else {
        setTimeout(go, 25)
      }
    }
    go()
  })
}

export const endpoints = {
  play: (videoId, playlistId) => ({ watchEndpoint: { videoId, ...(playlistId ? { playlistId } : {}) } }),
  radio: (videoId) => ({ watchEndpoint: { videoId, playlistId: `RDAMVM${videoId}`, params: 'wAEB' } }),
  playlist: (playlistId) => ({ watchEndpoint: { playlistId } }),
  browse: (browseId, params, pageType) => ({ browseEndpoint: { browseId, ...(params ? { params } : {}), ...(pageType ? { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: `MUSIC_PAGE_TYPE_${pageType}` } } } : {}) } }),
  search: (query) => ({ searchEndpoint: { query } })
}

export function nextVideo() {
  const p = playerApi()
  if (!p?.nextVideo) return false
  p.nextVideo()
  return true
}

// ---------- aktuelle seite ----------

// browse seite die gerade angezeigt wird, aus dem app zustand
export function currentBrowse() {
  const main = appState()?.navigation?.mainContent
  const data = main?.endpoint?.data
  if (!data?.browseId || !main?.response) return null
  return { browseId: data.browseId, params: data.params || null, response: main.response }
}
