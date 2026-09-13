import { listen } from './lifecycle.js'
import { log } from './log.js'
import { player } from './bridge.js'

const handlers = { page: new Set(), video: new Set(), start: new Set() }

export const nav = {
  page: 'other',
  url: '',
  videoId: null,
  playlistId: null,
  eventsSeen: new Set(),
  on(type, fn) {
    handlers[type].add(fn)
    return () => handlers[type].delete(fn)
  }
}

export function pageFromUrl(href) {
  let u
  try { u = new URL(href, location.origin) } catch { return 'other' }
  const p = u.pathname
  if (p === '/' || p === '') return 'home'
  if (p.startsWith('/watch')) return 'watch'
  if (p.startsWith('/results')) return 'search'
  if (p.startsWith('/playlist')) return 'playlist'
  if (p.startsWith('/shorts/')) return 'shorts'
  if (p.startsWith('/feed/subscriptions')) return 'subscriptions'
  if (p.startsWith('/feed/history')) return 'history'
  if (p.startsWith('/feed/you') || p.startsWith('/feed/library')) return 'you'
  if (p.startsWith('/feed/')) return 'feed'
  if (/^\/(@|channel\/|c\/|user\/)/.test(p)) return 'channel'
  return 'other'
}

function emit(type, ...args) {
  for (const fn of handlers[type]) {
    try { fn(...args) } catch (e) { log.error(`nav ${type}`, e) }
  }
}

export function checkNav() {
  const href = location.href
  const page = pageFromUrl(href)
  const u = new URL(href)
  let videoId = page === 'watch' ? u.searchParams.get('v') : null
  // player kann bei miniplayer abweichen daher url zuerst
  if (page === 'watch' && !videoId) {
    try { videoId = player()?.getVideoData?.()?.video_id || null } catch {}
  }
  const playlistId = u.searchParams.get('list')
  const pageChanged = page !== nav.page || href !== nav.url
  const videoChanged = videoId !== nav.videoId
  nav.url = href
  nav.playlistId = playlistId
  if (page !== nav.page) {
    nav.page = page
    document.documentElement.setAttribute('data-ytx-page', page)
  }
  if (videoChanged) nav.videoId = videoId
  if (pageChanged) emit('page', page)
  if (videoChanged) emit('video', videoId)
}

export function initNav() {
  nav.page = pageFromUrl(location.href)
  document.documentElement.setAttribute('data-ytx-page', nav.page)
  const seen = (e) => nav.eventsSeen.add(e.type)
  listen(document, 'yt-navigate-start', (e) => {
    seen(e)
    const url = e.detail?.url
    emit('start', url ? pageFromUrl(url) : null, url)
  })
  for (const type of ['yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']) {
    listen(document, type, (e) => {
      seen(e)
      checkNav()
    })
  }
  listen(window, 'popstate', () => checkNav())
  checkNav()
}
