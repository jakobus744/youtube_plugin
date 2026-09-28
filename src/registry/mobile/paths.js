import { qs, qsa } from '../../core/dom.js'
import { parseDuration, parseAgeDays, firstInt } from '../../core/format.js'
import { pageFromUrl } from '../youtube/pages.js'

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
