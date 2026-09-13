import { dataOf, pick, pickAny, runsText, player } from '../core/bridge.js'
import { qs, qsa } from '../core/dom.js'
import { parseDuration, parseAgeDays, firstInt } from '../core/format.js'

// wo daten stehen
// zwei generationen von youtube komponenten laufen parallel
// polymer renderer mit .data und neue view models ohne daten nur mit dom

// youtube behaelt vorherige seiten versteckt im dom
export function activePageRoots() {
  const roots = qsa('ytd-page-manager#page-manager > :not([hidden])')
  return roots.length ? roots : [document]
}

// ---------- kacheln fuer filter ----------

export const CARD_SELECTORS = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'yt-lockup-view-model',
  'ytd-playlist-video-renderer'
]

// verschachtelte kacheln nicht doppelt zaehlen
export const CARD_PARENT = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer'

function parseHref(href) {
  if (!href) return {}
  try {
    const u = new URL(href, location.origin)
    if (u.pathname.startsWith('/shorts/')) return { videoId: u.pathname.split('/')[2], isShort: true }
    return { videoId: u.searchParams.get('v'), list: u.searchParams.get('list'), index: firstInt(u.searchParams.get('index')), radio: u.searchParams.get('start_radio') === '1' }
  } catch {
    return {}
  }
}

function overlayInfo(overlays) {
  const out = { durationSec: null, isShort: false, live: false, percent: null }
  for (const o of overlays || []) {
    const ts = o.thumbnailOverlayTimeStatusRenderer
    if (ts) {
      if (ts.style === 'SHORTS') out.isShort = true
      if (ts.style === 'LIVE') out.live = true
      out.durationSec ??= parseDuration(runsText(ts.text))
    }
    const rp = o.thumbnailOverlayResumePlaybackRenderer
    if (rp) out.percent = rp.percentDurationWatched ?? null
  }
  return out
}

export function readPolymerCard(el) {
  let d = dataOf(el)
  if (!d) return null
  // rich item haelt den eigentlichen renderer in content
  if (d.content) d = d.content.videoRenderer || d.content.reelItemRenderer || d.content.lockupViewModel || d.content
  if (!d.videoId && !d.title) return null
  const owner = d.ownerText || d.longBylineText || d.shortBylineText
  const ov = overlayInfo(d.thumbnailOverlays)
  return {
    kind: 'video',
    videoId: d.videoId || null,
    title: runsText(d.title) || runsText(d.headline) || '',
    channel: runsText(owner),
    channelUrl: pick(owner, 'runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl') || '',
    channelId: pick(owner, 'runs[0].navigationEndpoint.browseEndpoint.browseId') || '',
    durationSec: parseDuration(runsText(d.lengthText)) ?? ov.durationSec,
    isShort: !!d.navigationEndpoint?.reelWatchEndpoint || ov.isShort,
    live: ov.live || (d.badges || []).some((b) => /LIVE/.test(b.metadataBadgeRenderer?.style || '')),
    percent: ov.percent,
    ageDays: parseAgeDays(runsText(d.publishedTimeText))
  }
}

export function readLockupCard(el) {
  const a = qs('a[href*="/watch?"], a[href^="/shorts/"], a[href^="/playlist?"]', el)
  const href = a?.getAttribute('href') || ''
  const info = parseHref(href)
  const titleEl = qs('h3', el) || qs('[class*="MetadataViewModelTitle"]', el)
  const channelLink = qs('a[href^="/@"], a[href^="/channel/"]', el)
  let channel = channelLink?.textContent.trim() || ''
  const parts = qsa('yt-content-metadata-view-model span[role="text"], yt-content-metadata-view-model span', el).map((s) => s.textContent.trim()).filter(Boolean)
  if (!channel && parts.length) channel = parts[0]
  let durationSec = null
  let live = false
  for (const b of qsa('badge-shape', el)) {
    const t = b.textContent.trim()
    if (/live/i.test(b.className) || /^(live|live jetzt)$/i.test(t)) live = true
    durationSec ??= parseDuration(t)
  }
  let percent = null
  const bar = qs('[class*="ProgressBarSegment"][style*="width"], yt-thumbnail-overlay-progress-bar-view-model [style*="width"]', el)
  if (bar) percent = firstInt(bar.style.width)
  let ageDays = null
  for (const p of parts) {
    ageDays = parseAgeDays(p)
    if (ageDays != null) break
  }
  const isPlaylist = href.startsWith('/playlist?') || !!qs('yt-collection-thumbnail-view-model, yt-collections-stack', el)
  return {
    kind: isPlaylist ? 'playlist' : info.radio ? 'mix' : 'video',
    videoId: info.videoId || null,
    title: titleEl?.textContent.trim() || a?.getAttribute('title') || '',
    channel,
    channelUrl: channelLink?.getAttribute('href') || '',
    channelId: '',
    durationSec,
    isShort: !!info.isShort,
    live,
    percent,
    ageDays
  }
}

export function readCard(el) {
  if (el.tagName === 'YT-LOCKUP-VIEW-MODEL') return readLockupCard(el)
  const inner = el.tagName === 'YTD-RICH-ITEM-RENDERER' ? qs('yt-lockup-view-model', el) : null
  if (inner) return readLockupCard(inner)
  const shortsLockup = qs('ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2', el)
  if (shortsLockup) {
    const a = qs('a[href^="/shorts/"]', shortsLockup)
    return { kind: 'video', videoId: parseHref(a?.getAttribute('href')).videoId, title: a?.getAttribute('title') || shortsLockup.textContent.trim(), channel: '', channelUrl: '', durationSec: null, isShort: true, live: false, percent: null, ageDays: null }
  }
  return readPolymerCard(el) || readLockupCard(el)
}

// ---------- playlist seite ----------

export const playlistPage = {
  root: 'ytd-browse[page-subtype="playlist"]',
  polymerItems: 'ytd-browse[page-subtype="playlist"] ytd-playlist-video-list-renderer ytd-playlist-video-renderer',
  lockupItems: 'ytd-browse[page-subtype="playlist"] yt-item-section-renderer yt-lockup-view-model, ytd-browse[page-subtype="playlist"] ytd-item-section-renderer yt-lockup-view-model',
  continuation: [
    'ytd-browse[page-subtype="playlist"] ytd-playlist-video-list-renderer ytd-continuation-item-renderer',
    'ytd-browse[page-subtype="playlist"] yt-item-section-renderer #contents > :last-child:not(:has(yt-lockup-view-model))',
    'ytd-browse[page-subtype="playlist"] ytd-item-section-renderer ytd-continuation-item-renderer'
  ],
  dragHandles: 'ytd-browse[page-subtype="playlist"] ytd-playlist-video-renderer #reorder',

  readPolymerItem(el) {
    const d = dataOf(el)
    if (!d) return null
    const ov = overlayInfo(d.thumbnailOverlays)
    const len = d.lengthSeconds != null ? Number(d.lengthSeconds) : parseDuration(runsText(d.lengthText))
    return {
      el,
      wrapper: el,
      videoId: d.videoId,
      index: firstInt(runsText(d.index)) ?? null,
      title: runsText(d.title),
      channel: runsText(d.shortBylineText),
      durationSec: len || null,
      percent: ov.percent,
      live: ov.live,
      unavailable: d.isPlayable === false || !len
    }
  },

  readLockupItem(el) {
    const c = readLockupCard(el)
    const a = qs('a[href*="/watch?"]', el)
    const info = parseHref(a?.getAttribute('href'))
    // wrapper ist das direkte kind von #contents
    let wrapper = el
    while (wrapper.parentElement && wrapper.parentElement.id !== 'contents') wrapper = wrapper.parentElement
    return {
      el,
      wrapper,
      videoId: c.videoId,
      index: info.index ?? null,
      title: c.title,
      channel: c.channel,
      durationSec: c.durationSec,
      percent: c.percent,
      live: c.live,
      unavailable: !c.durationSec && !c.live
    }
  },

  listContainer(kind) {
    return kind === 'polymer'
      ? qs('ytd-browse[page-subtype="playlist"] ytd-playlist-video-list-renderer #contents')
      : qs('ytd-browse[page-subtype="playlist"] yt-item-section-renderer #contents, ytd-browse[page-subtype="playlist"] ytd-item-section-renderer #contents')
  },

  total() {
    const d = dataOf(qs('ytd-browse[page-subtype="playlist"]'))
    const fromData = pickAny(d, [
      (x) => runsText(x.header.playlistHeaderRenderer.numVideosText),
      (x) => runsText(x.header.playlistHeaderRenderer.stats[0]),
      (x) => runsText(x.sidebar.playlistSidebarRenderer.items[0].playlistSidebarPrimaryInfoRenderer.stats[0]),
      (x) =>
        x.header.pageHeaderRenderer.content.pageHeaderViewModel.metadata.contentMetadataViewModel.metadataRows
          .flatMap((r) => r.metadataParts)
          .map((p) => p.text?.content)
          .find((t) => t && /\d/.test(t) && !/[.:]\d{2}\b.*\d{4}/.test(t))
    ])
    if (fromData) return firstInt(fromData)
    const el = qs('ytd-browse[page-subtype="playlist"] ytd-playlist-byline-renderer, ytd-browse[page-subtype="playlist"] yt-content-metadata-view-model')
    return el ? firstInt(el.textContent) : null
  },

  playlistId() {
    return new URL(location.href).searchParams.get('list')
  }
}

// ---------- playlist panel auf der videoseite ----------

export const playlistPanel = {
  root: 'ytd-watch-flexy ytd-playlist-panel-renderer#playlist',
  read() {
    const el = qs(this.root)
    if (!el || el.hasAttribute('hidden')) return null
    const d = dataOf(el)
    if (!d || !Array.isArray(d.contents)) return null
    const items = []
    d.contents.forEach((c, pos) => {
      const r = c.playlistPanelVideoRenderer || c.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer
      if (!r) return
      const ov = overlayInfo(r.thumbnailOverlays)
      items.push({
        videoId: r.videoId,
        index: r.navigationEndpoint?.watchEndpoint?.index ?? firstInt(runsText(r.indexText)) ?? pos,
        durationSec: parseDuration(runsText(r.lengthText)),
        percent: ov.percent,
        selected: !!r.selected
      })
    })
    const total = d.totalVideos ?? firstInt(runsText(d.totalVideosText))
    const current = d.localCurrentIndex ?? d.currentIndex ?? items.find((i) => i.selected)?.index ?? 0
    return { el, items, total, current, infinite: !!d.isInfinite }
  },
  itemElements() {
    return qsa('ytd-watch-flexy ytd-playlist-panel-renderer#playlist ytd-playlist-panel-video-renderer')
  }
}

// ---------- videoseite ----------

export const watch = {
  playerResponse() {
    try { return player()?.getPlayerResponse?.() || null } catch { return null }
  },
  videoData() {
    try { return player()?.getVideoData?.() || null } catch { return null }
  },
  captionTracks(pr = this.playerResponse()) {
    return pick(pr, 'captions.playerCaptionsTracklistRenderer.captionTracks') || []
  },
  publishDate(pr = this.playerResponse()) {
    return pickAny(pr, ['microformat.playerMicroformatRenderer.publishDate', 'microformat.playerMicroformatRenderer.uploadDate'])
  },
  description(pr = this.playerResponse()) {
    const flexy = dataOf(qs('ytd-watch-flexy'))
    const fromNext = pickAny(flexy, [
      (x) => x.contents.twoColumnWatchNextResults.results.results.contents.find((c) => c.videoSecondaryInfoRenderer).videoSecondaryInfoRenderer.attributedDescription.content
    ])
    return fromNext || pick(pr, 'videoDetails.shortDescription') || ''
  },
  chapters() {
    const panel = qs('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]')
    const list = pick(dataOf(panel), 'content.macroMarkersListRenderer.contents') || []
    const out = []
    for (const c of list) {
      const r = c.macroMarkersListItemRenderer
      if (!r) continue
      const sec = r.onTap?.watchEndpoint?.startTimeSeconds ?? parseDuration(runsText(r.timeDescription))
      if (sec != null) out.push({ title: runsText(r.title), startSec: sec })
    }
    if (out.length) return out
    // fallback aus den player overlay daten
    const flexy = dataOf(qs('ytd-watch-flexy'))
    const map = pickAny(flexy, ['playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap']) || []
    for (const m of map) {
      for (const ch of m.value?.chapters || []) {
        const r = ch.chapterRenderer
        if (r) out.push({ title: runsText(r.title), startSec: Math.round((r.timeRangeStartMillis || 0) / 1000) })
      }
      if (out.length) break
    }
    return out
  },
  // url die der player selbst mit token fuer untertitel anfragt
  isTimedtextUrl(url) {
    return /\/api\/timedtext\?/.test(url) && /[?&]pot=/.test(url)
  }
}
