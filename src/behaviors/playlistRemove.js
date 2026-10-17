import { pageWindow, ytcfg } from '../core/bridge.js'
import { onSweep } from '../core/observer.js'
import { toast } from '../features/ui.js'

// die liste im panel unter dem video hat auf m.youtube.com kein drei punkte menue und kein wischen zum entfernen
// ein eintrag nach links wischen oder das menue antippen entfernt das video aus der playlist, mit dem gleichen aufruf, den auch youtube dafuer nutzt
const PANEL_ITEM = 'ytm-playlist-panel-video-renderer'
// auf der Playlist Seite selbst hat YouTube das Menue schon, dort kommt nur das Wischen dazu
const PAGE_ITEM = 'ytm-playlist-video-renderer'
const ITEM = `${PANEL_ITEM}, ${PAGE_ITEM}`

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function authHeader() {
  const sid = document.cookie.match(/(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/)?.[1]
  if (!sid) return null
  const ts = Math.floor(Date.now() / 1000)
  const h = hex(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sid} ${location.origin}`)))
  return `SAPISIDHASH ${ts}_${h}`
}

async function post(path, body) {
  const auth = await authHeader()
  const key = ytcfg('INNERTUBE_API_KEY')
  const context = ytcfg('INNERTUBE_CONTEXT')
  if (!auth || !key || !context) return false
  const r = await fetch(`/youtubei/v1/${path}?key=${key}&prettyPrint=false`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', authorization: auth, 'x-origin': location.origin, 'x-goog-authuser': '0' },
    body: JSON.stringify({ context, ...body })
  })
  return r.ok ? r.json().catch(() => null) : false
}

export async function removeFromPlaylist(listId, videoId) {
  const j = await post('browse/edit_playlist', { playlistId: listId, actions: [{ action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: videoId }] })
  return j?.status === 'STATUS_SUCCEEDED'
}

const listId = () => new URL(location.href).searchParams.get('list')
const videoOf = (el) => el.querySelector('a[href*="/watch?"]')?.getAttribute('href')?.match(/[?&]v=([\w-]{11})/)?.[1]

async function remove(el) {
  const id = videoOf(el)
  const list = listId()
  if (!id || !list) return
  el.style.transition = 'opacity .2s'
  el.style.opacity = '0.4'
  let ok = false
  try {
    ok = await removeFromPlaylist(list, id)
  } catch {}
  if (ok) {
    el.style.display = 'none'
    toast('Aus Playlist entfernt')
  } else {
    el.style.opacity = ''
    toast('Entfernen nicht möglich (nur eigene Playlists)', 'warn')
  }
}

// kleines menue mit dem einen eintrag, den youtube in seinem menue bei eigenen playlists hat
function openMenu(btn, el) {
  document.querySelector('.ytx-plmenu')?.remove()
  const m = document.createElement('div')
  m.className = 'ytx-plmenu'
  m.setAttribute('data-ytx-own', '')
  const add = (label, fn) => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', () => {
      gone()
      fn()
    })
    m.append(b)
  }
  const id = videoOf(el)
  add('Gefällt mir', async () => {
    const j = await post('like/like', { target: { videoId: id } }).catch(() => false)
    toast(j ? 'Gefällt mir gesetzt' : 'Gefällt mir nicht möglich', j ? 'info' : 'warn')
  })
  add('Link kopieren', async () => {
    try {
      await navigator.clipboard.writeText(`https://youtu.be/${id}`)
      toast('Link kopiert')
    } catch {
      toast('Kopieren nicht möglich', 'warn')
    }
  })
  add('Aus Playlist entfernen', () => remove(el))
  const r = btn.getBoundingClientRect()
  m.style.top = `${Math.min(r.bottom, innerHeight - 190)}px`
  document.body.append(m)
  const close = (e) => {
    if (m.contains(e.target)) return
    gone()
  }
  const gone = () => {
    m.remove()
    document.removeEventListener('click', close, true)
    document.removeEventListener('scroll', gone, true)
    document.removeEventListener('touchmove', gone, true)
  }
  setTimeout(() => {
    document.addEventListener('click', close, true)
    document.addEventListener('scroll', gone, { capture: true, passive: true })
    document.addEventListener('touchmove', gone, { capture: true, passive: true })
  }, 0)
}

const CSS = `
${PANEL_ITEM} { position: relative; }
${PANEL_ITEM} .ytx-plmore { position: absolute; right: 2px; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border: 0; background: none; color: inherit; font-size: 22px; line-height: 1; z-index: 2; }
${PANEL_ITEM} .YtmCompactMediaItemMetadata { padding-right: 36px; box-sizing: border-box; }
.ytx-plmenu { position: fixed; right: 14px; z-index: 2147483000; background: var(--ytx-menu, #2a2a2a); border-radius: 12px; box-shadow: 0 4px 18px #0008; }
.ytx-plmenu { display: flex; flex-direction: column; }
.ytx-plmenu button { text-align: left; border: 0; background: none; color: var(--ytx-accent, #fff); font-size: 16px; padding: 14px 18px; }
${PANEL_ITEM}[data-ytx-swipe], ${PAGE_ITEM}[data-ytx-swipe] { will-change: transform; }`

export const playlistRemove = {
  id: 'playlistRemove',
  label: 'Playlist: Eintrag wischen oder Menü zum Entfernen',
  description: 'In der Liste unter dem Video: Eintrag nach links wischen oder ⋮ antippen entfernt das Video aus der Playlist (eigene Playlists)',
  type: 'toggle',
  default: true,
  start() {
    const style = document.createElement('style')
    style.setAttribute('data-ytx-own', '')
    style.textContent = CSS
    document.head.append(style)

    const off = onSweep('playlistRemove', () => {
      if (!listId()) return
      for (const el of document.querySelectorAll(PANEL_ITEM)) {
        if (el.querySelector('.ytx-plmore')) continue
        const b = document.createElement('button')
        b.className = 'ytx-plmore'
        b.setAttribute('data-ytx-own', '')
        b.setAttribute('aria-label', 'Menü')
        b.textContent = '⋮'
        b.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          openMenu(b, el)
        })
        el.append(b)
      }
    })

    // wischen: nur waagerecht nach links, ab der haelfte der breite wird entfernt
    let t = null
    const onStart = (e) => {
      const el = e.target?.closest?.(ITEM)
      if (!el || e.target.closest('.ytx-plmore') || e.touches.length !== 1) return
      t = { el, x: e.touches[0].clientX, y: e.touches[0].clientY, mode: null, w: el.getBoundingClientRect().width }
    }
    const onMove = (e) => {
      if (!t) return
      const dx = e.touches[0].clientX - t.x
      const dy = e.touches[0].clientY - t.y
      if (!t.mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        t.mode = Math.abs(dx) > Math.abs(dy) * 1.5 && dx < 0 ? 'swipe' : 'scroll'
        if (t.mode === 'swipe') t.el.setAttribute('data-ytx-swipe', '')
      }
      if (t.mode !== 'swipe') return
      e.preventDefault()
      const d = Math.min(0, dx)
      t.el.style.transform = `translateX(${d}px)`
      t.el.style.opacity = String(Math.max(0.3, 1 + d / t.w))
    }
    const onEnd = () => {
      if (!t) return
      const { el, mode, w } = t
      t = null
      if (mode !== 'swipe') return
      const moved = Number((el.style.transform.match(/-?[\d.]+/) || [0])[0])
      el.removeAttribute('data-ytx-swipe')
      el.style.transform = ''
      el.style.opacity = ''
      if (-moved > w * 0.45) remove(el)
    }
    document.addEventListener('touchstart', onStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onMove, { capture: true, passive: false })
    document.addEventListener('touchend', onEnd, { capture: true, passive: true })
    document.addEventListener('touchcancel', onEnd, { capture: true, passive: true })

    return () => {
      off()
      style.remove()
      document.removeEventListener('touchstart', onStart, true)
      document.removeEventListener('touchmove', onMove, true)
      document.removeEventListener('touchend', onEnd, true)
      document.removeEventListener('touchcancel', onEnd, true)
      document.querySelectorAll('.ytx-plmore, .ytx-plmenu').forEach((e) => e.remove())
    }
  }
}
