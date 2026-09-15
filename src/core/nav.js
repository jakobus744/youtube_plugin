import { listen, onDispose } from './lifecycle.js'
import { log } from './log.js'
import { site } from '../sites/index.js'

const handlers = { page: new Set(), video: new Set(), start: new Set() }

export const nav = {
  page: 'other',
  url: '',
  videoId: null,
  playlistId: null,
  eventsSeen: new Set(),
  lastCheck: 0,
  on(type, fn) {
    handlers[type].add(fn)
    return () => handlers[type].delete(fn)
  }
}

export const pageFromUrl = (href) => site.pageFromUrl(href)

function emit(type, ...args) {
  for (const fn of handlers[type]) {
    try { fn(...args) } catch (e) { log.error(`nav ${type}`, e) }
  }
}

// seite kommt aus der url, video id liefert die site
// bei music laeuft der player seitenuebergreifend weiter
export function checkNav() {
  const href = location.href
  const page = site.pageFromUrl(href)
  let videoId = null
  try { videoId = site.currentVideoId ? site.currentVideoId(page, href) : site.videoIdFromUrl(href) } catch {}
  let playlistId = null
  try { playlistId = new URL(href).searchParams.get('list') } catch {}
  const pageChanged = page !== nav.page || href !== nav.url
  const videoChanged = videoId !== nav.videoId
  nav.url = href
  nav.playlistId = playlistId
  nav.lastCheck = Date.now()
  if (page !== nav.page) {
    nav.page = page
    document.documentElement.setAttribute('data-ytx-page', page)
  }
  if (videoChanged) nav.videoId = videoId
  if (pageChanged) emit('page', page)
  if (videoChanged) emit('video', videoId)
}

export function initNav() {
  nav.page = site.pageFromUrl(location.href)
  document.documentElement.setAttribute('data-ytx-page', nav.page)
  document.documentElement.setAttribute('data-ytx-site', site.id)
  const seen = (e) => nav.eventsSeen.add(e.type)
  listen(document, 'yt-navigate-start', (e) => {
    seen(e)
    const url = e.detail?.url
    emit('start', url ? site.pageFromUrl(url) : null, url)
  })
  for (const type of ['yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']) {
    listen(document, type, (e) => {
      seen(e)
      checkNav()
    })
  }
  listen(window, 'popstate', () => checkNav())
  // music feuert die yt-navigate events nicht zuverlaessig daher zusaetzlich die history api beobachten
  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn]
    if (orig.__ytx) continue
    const wrapped = function (...args) {
      const r = orig.apply(this, args)
      setTimeout(checkNav, 0)
      return r
    }
    wrapped.__ytx = true
    wrapped.__orig = orig
    history[fn] = wrapped
  }
  onDispose(disposeNavHooks)
  checkNav()
}

export function disposeNavHooks() {
  for (const fn of ['pushState', 'replaceState']) if (history[fn]?.__orig) history[fn] = history[fn].__orig
}
