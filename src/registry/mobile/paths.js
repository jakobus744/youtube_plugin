import { qs, qsa } from '../../core/dom.js'
import { parseDuration, parseAgeDays, firstInt } from '../../core/format.js'
import { pageFromUrl } from '../youtube/pages.js'
import { watch as desktopWatch, playlistPage as desktopPlaylistPage } from '../youtube/paths.js'
import { chaptersFromDescription } from '../youtube/chapters.js'

// datenquellen auf m.youtube.com
// die mobilseite haengt keine daten an ihre elemente, alles kommt aus dem dom

export function activePageRoots() {
  const root = qs('ytm-app .page-container')
  return root ? [root] : [document]
}

export const CARD_SELECTORS = ['ytm-rich-item-renderer', 'ytm-video-with-context-renderer', 'ytm-compact-video-renderer', 'ytm-shorts-lockup-view-model', 'ytm-playlist-video-renderer', 'yt-lockup-view-model']

export const CARD_PARENT = 'ytm-rich-item-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-playlist-video-renderer'

function parseHref(href) {
  if (!href) return {}
  try {
    const u = new URL(href, location.origin)
    if (u.pathname.startsWith('/shorts/')) return { videoId: u.pathname.split('/')[2], isShort: true }
    return { videoId: u.searchParams.get('v'), radio: u.searchParams.get('start_radio') === '1' }
  } catch {
    return {}
  }
}

export function readCard(el) {
  const a = qs('a[href^="/watch"], a[href^="/shorts/"], a[href^="/playlist"]', el)
  const href = a?.getAttribute('href') || ''
  const info = parseHref(href)
  const channelLink = qs('a[href^="/@"], a[href^="/channel/"]', el)
  const lines = qsa('.ytmBadgeAndBylineRendererItemByline, ytm-badge-and-byline-renderer', el)
    .map((x) => x.textContent.trim())
    .filter(Boolean)
  const parts = lines.flatMap((l) => l.split('•').map((s) => s.trim())).filter(Boolean)
  const title = (qs('.media-item-headline, h3, [class*="Headline"], [class*="Title"]', el)?.textContent || a?.getAttribute('title') || a?.getAttribute('aria-label') || '').trim()
  const badge = qs('ytm-thumbnail-overlay-time-status-renderer, badge-shape', el)
  const live = badge?.getAttribute('data-style') === 'LIVE' || /live/i.test(badge?.className || '')
  const bar = qs('ytm-thumbnail-overlay-resume-playback-renderer [style*="width"], [class*="ResumePlayback"] [style*="width"], [class*="ProgressBarSegment"][style*="width"]', el)
  let ageDays = null
  for (const p of parts) {
    ageDays = parseAgeDays(p)
    if (ageDays != null) break
  }
  const isShort = !!info.isShort || el.tagName === 'YTM-SHORTS-LOCKUP-VIEW-MODEL'
  return {
    kind: href.startsWith('/playlist') ? 'playlist' : info.radio ? 'mix' : 'video',
    videoId: info.videoId || null,
    title,
    // erste zeile der byline ist der kanal, avatar link liefert das handle
    channel: isShort ? '' : parts[0] || '',
    channelUrl: channelLink?.getAttribute('href') || '',
    channelId: '',
    durationSec: parseDuration(badge?.textContent || ''),
    isShort,
    live,
    percent: bar ? firstInt(bar.style.width) : null,
    ageDays
  }
}

// ---------- kanaele ----------

export function channelPageInfo() {
  const m = location.pathname.match(/^\/(@[^/]+)/)
  const id = (location.pathname.match(/^\/channel\/(UC[\w-]{22})/) || [])[1] || null
  if (!m && !id) return null
  const name = qs('ytm-browse yt-page-header-view-model h1, ytm-browse yt-page-header-renderer h1, ytm-browse .page-header-view-model-wiz__page-header-title')?.textContent.trim() || ''
  return { id, handle: m ? decodeURIComponent(m[1]).toLowerCase() : null, name: name || (m ? decodeURIComponent(m[1]).slice(1) : '') }
}

// ohne seitendaten keine abo liste, gruppen lernen kanaele aus feed und kanalseiten
export function subscribedChannels() {
  return []
}

// ---------- wiedergabe ----------

function mainPlayer() {
  return qsa('#movie_player').find((p) => typeof p.getPlayerState === 'function') || null
}

export function activePlayback() {
  // vorschauen im feed laufen ueber denselben player, zaehlen nur auf video und shorts seiten
  const page = pageFromUrl(location.href)
  if (page !== 'watch' && page !== 'shorts') return null
  const p = mainPlayer()
  if (!p) return null
  try {
    const vd = p.getVideoData?.() || {}
    if (!vd.video_id) return null
    const pr = p.getPlayerResponse?.()
    const details = pr?.videoDetails?.videoId === vd.video_id ? pr.videoDetails : null
    return {
      videoId: vd.video_id,
      kind: page === 'shorts' ? 'short' : 'video',
      title: vd.title || details?.title || '',
      channel: { id: details?.channelId || null, name: vd.author || details?.author || '' },
      playing: p.getPlayerState() === 1,
      ad: p.classList.contains('ad-showing'),
      pos: p.getCurrentTime?.() || 0,
      dur: p.getDuration?.() || 0,
      live: !!vd.isLive
    }
  } catch {
    return null
  }
}

export function pauseActive() {
  try {
    mainPlayer()?.pauseVideo?.()
  } catch {}
}

// ---------- videoseite ----------
// derselbe html5 player wie am rechner, daten kommen aus seiner api

export const watch = {
  playerResponse() {
    try { return mainPlayer()?.getPlayerResponse?.() || null } catch { return null }
  },
  videoData() {
    try { return mainPlayer()?.getVideoData?.() || null } catch { return null }
  },
  captionTracks(pr = this.playerResponse()) {
    return desktopWatch.captionTracks(pr)
  },
  publishDate(pr = this.playerResponse()) {
    return desktopWatch.publishDate(pr)
  },
  description(pr = this.playerResponse()) {
    return pr?.videoDetails?.shortDescription || ''
  },
  chapters() {
    const out = []
    for (const el of qsa('ytm-macro-markers-list-item-renderer')) {
      const title = qs('h4, [class*="title" i]', el)?.textContent.trim() || ''
      const time = qs('[class*="time" i]', el)?.textContent.trim() || ''
      const sec = parseDuration(time)
      if (title && sec != null && !out.some((c) => c.startSec === sec)) out.push({ title, startSec: sec })
    }
    return out.length ? out : chaptersFromDescription(this.description())
  },
  isTimedtextUrl(url) {
    return desktopWatch.isTimedtextUrl(url)
  }
}

// ---------- playlist seite ----------
// gleiche lockup bausteine wie am rechner

const PL = 'ytm-browse'

export const playlistPage = {
  root: PL,
  polymerItems: 'ytx-none',
  lockupItems: `${PL} yt-item-section-renderer yt-lockup-view-model, ${PL} ytm-item-section-renderer yt-lockup-view-model`,
  continuation: [`${PL} yt-continuation-item-view-model`, `${PL} ytm-continuation-item-renderer`],
  dragHandles: 'ytx-none',
  readPolymerItem: () => null,
  readLockupItem: (el) => desktopPlaylistPage.readLockupItem(el),
  listContainer() {
    return qs(`${PL} yt-item-section-renderer #contents, ${PL} ytm-item-section-renderer #contents`)
  },
  // „41 Videos“ im kopf, der kanalname davor kann selbst zahlen enthalten
  total() {
    const text = qs(`${PL} yt-page-header-view-model yt-content-metadata-view-model`)?.textContent || ''
    const m = text.match(/(\d[\d.]*)\s*(?:Videos?|videos?|Titel|Folgen)/)
    return m ? firstInt(m[1].replace(/\./g, '')) : null
  },
  playlistId() {
    return new URL(location.href).searchParams.get('list')
  }
}

// ---------- playlist auf der videoseite ----------
// liste im ausklappbaren panel, laedt nur sichtbare eintraege

function panelCount() {
  const t = qs('.playlist-engagement-panel-list-count, ytm-playlist-panel-entry-point .playlist-panel-subhead')?.textContent || ''
  const m = t.match(/(\d+)\s*\/\s*(\d+)/)
  return m ? { current: Number(m[1]) - 1, total: Number(m[2]) } : null
}

export const playlistPanel = {
  root: 'ytm-playlist-engagement-panel, ytm-playlist-panel-entry-point',
  read() {
    if (!new URL(location.href).searchParams.get('list') || !qs(this.root)) return null
    const items = []
    for (const el of this.itemElements()) {
      const a = qs('a[href*="/watch?"]', el)
      const u = new URL(a?.getAttribute('href') || '/', location.origin)
      const idx = firstInt(u.searchParams.get('index'))
      const bar = qs('[class*="ResumePlayback"] [style*="width"], ytm-thumbnail-overlay-resume-playback-renderer [style*="width"], [class*="ProgressBar"] [style*="width"]', el)
      items.push({
        videoId: u.searchParams.get('v'),
        index: idx != null ? idx - 1 : items.length,
        durationSec: parseDuration(qs('ytm-thumbnail-overlay-time-status-renderer, badge-shape', el)?.textContent || ''),
        percent: bar ? firstInt(bar.style.width) : null,
        selected: el.getAttribute('aria-selected') === 'true'
      })
    }
    const c = panelCount()
    const current = c?.current ?? items.find((i) => i.selected)?.index ?? 0
    return { el: qs(this.root), items, total: c?.total ?? null, current, infinite: false }
  },
  itemElements() {
    return qsa('ytm-playlist-panel-video-renderer')
  },
  readElement(el) {
    const a = qs('a[href*="/watch?"]', el)
    const videoId = a ? new URL(a.getAttribute('href'), location.origin).searchParams.get('v') : null
    const title = qs('h4, [class*="Headline"]', el)?.textContent.trim() || ''
    const channel = qs('[class*="Byline"], [class*="Subhead"], [class*="subhead"]', el)?.textContent.trim() || ''
    return videoId ? { videoId, title, channel } : null
  }
}

// ---------- drei punkte menue ----------
// auf dem handy ein blatt von unten, im querformat ein popup

export const videoMenu = {
  popup: 'bottom-sheet-container, #menu.menu-container',
  lists: ['bottom-sheet-container .bottom-sheet-media-menu-item', 'bottom-sheet-container yt-list-view-model', '#menu.menu-container .menu-content'],
  watchOwn: 'ytm-slim-video-action-bar-renderer',
  cards: [...CARD_SELECTORS, 'ytm-playlist-panel-video-renderer'].join(', '),
  async close() {
    const scrim = qsa('ytw-scrim .ytWebScrimHiddenButton, ytw-scrim button').find((b) => b.getClientRects().length)
    if (scrim) scrim.click()
    else if (/^#(bottom-sheet|menu)$/.test(location.hash)) history.back()
    await new Promise((r) => setTimeout(r, 350))
  }
}
